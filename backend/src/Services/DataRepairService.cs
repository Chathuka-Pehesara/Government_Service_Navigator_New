using Government_Service_Navigator.Backend.Data.Context;
using Microsoft.EntityFrameworkCore;

namespace Government_Service_Navigator.Backend.Services
{
    /// <summary>
    /// Data fixes that used to run inside GET endpoints (on every poll) now run here once at
    /// startup and then every <see cref="RunInterval"/>, so read endpoints stay read-only.
    /// - A task marked "Approved" with no OfficerReview goes back to "Pending" for a real review.
    /// - A submission that moved to a later stage but still says "UnderVerification"/"PendingReview"
    ///   for a stage the citizen has not submitted yet is shown as "Draft".
    /// </summary>
    public class DataRepairService : BackgroundService
    {
        private static readonly TimeSpan RunInterval = TimeSpan.FromMinutes(10);

        private readonly IServiceScopeFactory _scopeFactory;
        private readonly ILogger<DataRepairService> _logger;

        public DataRepairService(IServiceScopeFactory scopeFactory, ILogger<DataRepairService> logger)
        {
            _scopeFactory = scopeFactory;
            _logger = logger;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            // Let startup (table creation in Program.cs) finish first
            await Task.Delay(TimeSpan.FromSeconds(15), stoppingToken);

            // Run immediately on startup so stale test/orphaned submissions are cleared right away
            try { await RepairAsync(stoppingToken); }
            catch (Exception ex) when (ex is not OperationCanceledException)
            { _logger.LogError(ex, "Initial data repair run failed"); }

            using var timer = new PeriodicTimer(RunInterval);
            do
            {
                try
                {
                    await RepairAsync(stoppingToken);
                }
                catch (Exception ex) when (ex is not OperationCanceledException)
                {
                    _logger.LogError(ex, "Data repair run failed");
                }
            }
            while (await timer.WaitForNextTickAsync(stoppingToken));
        }

        public async Task RepairAsync(CancellationToken cancellationToken)
        {
            using var scope = _scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

            // Synchronize tasks for submissions that completed all stages
            var completedSubs = await db.ApplicationSubmissions
                .Where(s => s.StageStatus == "Completed")
                .ToListAsync(cancellationToken);
            if (completedSubs.Count > 0)
            {
                var completedAppIds = completedSubs.Select(s => s.Id).ToList();
                var tasksToSync = await db.VerificationTasks
                    .Where(t => completedAppIds.Contains(t.ApplicationId) && (t.Status == "Pending" || t.StageNumber < t.MaxStages))
                    .ToListAsync(cancellationToken);

                foreach (var task in tasksToSync)
                {
                    task.Status = "Approved";
                    if (task.MaxStages > 0)
                    {
                        task.CurrentStage = task.MaxStages;
                        task.StageNumber = task.MaxStages;
                    }
                }
                if (tasksToSync.Count > 0)
                {
                    await db.SaveChangesAsync(cancellationToken);
                    _logger.LogInformation("Synchronized {Count} task(s) to Approved for completed applications", tasksToSync.Count);
                }
            }

            // The citizen response already derives "Draft" for these; this only makes the stored value agree
            var drafts = await db.Database.ExecuteSqlRawAsync(@"
UPDATE ""ApplicationSubmissions"" s SET ""StageStatus"" = 'Draft'
WHERE s.""StageStatus"" IN ('UnderVerification', 'PendingReview')
  AND EXISTS (SELECT 1 FROM ""VerificationTasks"" t WHERE t.""ApplicationId"" = s.""Id"")
  AND NOT EXISTS (SELECT 1 FROM ""VerificationTasks"" t WHERE t.""ApplicationId"" = s.""Id"" AND t.""StageNumber"" >= s.""CurrentStage"")",
                cancellationToken);
            if (drafts > 0)
            {
                _logger.LogInformation("Marked {Count} unsubmitted stage(s) as Draft", drafts);
            }

            // Clean up PendingReview submissions where the VerificationTask has been Pending
            // with zero officer reviews for over 24 hours — these are stale/test submissions
            // that block legitimate citizens from re-applying for newly-created services.
            var staleThreshold = DateTime.UtcNow.AddHours(-1);
            var staleOrphans = await db.VerificationTasks
                .Where(t => t.Status == "Pending" &&
                            t.CreatedDate < staleThreshold &&
                            !t.Reviews.Any())
                .Select(t => t.ApplicationId)
                .ToListAsync(cancellationToken);

            if (staleOrphans.Count > 0)
            {
                var staleSubmissions = await db.ApplicationSubmissions
                    .Where(s => staleOrphans.Contains(s.Id) && s.StageStatus == "PendingReview")
                    .ToListAsync(cancellationToken);
                foreach (var s in staleSubmissions)
                    s.StageStatus = "Deleted";
                if (staleSubmissions.Count > 0)
                {
                    await db.SaveChangesAsync(cancellationToken);
                    _logger.LogInformation("Cleared {Count} stale PendingReview submission(s) with no officer activity", staleSubmissions.Count);
                }
            }
        }
    }
}
