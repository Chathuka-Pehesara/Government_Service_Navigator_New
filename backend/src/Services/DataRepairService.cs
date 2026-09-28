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

            // Tracked update (not raw SQL) so the change interceptor refreshes the citizens' caches
            var unreviewed = await db.VerificationTasks
                .Where(t => t.Status == "Approved" && !t.Reviews.Any())
                .ToListAsync(cancellationToken);
            if (unreviewed.Count > 0)
            {
                foreach (var task in unreviewed) task.Status = "Pending";
                await db.SaveChangesAsync(cancellationToken);
                _logger.LogInformation("Reset {Count} approved task(s) without a review to Pending", unreviewed.Count);
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
        }
    }
}
