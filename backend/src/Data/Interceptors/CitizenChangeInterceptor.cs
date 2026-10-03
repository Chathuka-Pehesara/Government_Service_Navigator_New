using System.Data.Common;
using System.Runtime.CompilerServices;
using Government_Service_Navigator.Backend.Data.Context;
using Government_Service_Navigator.Backend.Models.Entities;
using Government_Service_Navigator.Backend.Services.Interfaces;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;

namespace Government_Service_Navigator.Backend.Data.Interceptors
{
    /// <summary>
    /// Watches every SaveChanges for entities that change what a citizen or officer sees and, once the
    /// data is committed, invalidates the cache and pushes a realtime update (ICitizenChangeNotifier).
    /// Doing this here instead of in each controller means a new write path cannot forget it.
    ///
    /// Inside an explicit transaction the notification waits for the commit (and is dropped on
    /// rollback), so a client never refetches data that is not visible yet. Raw SQL and
    /// ExecuteUpdate/ExecuteDelete bypass the change tracker and are not seen here.
    /// </summary>
    public sealed class CitizenChangeInterceptor : SaveChangesInterceptor
    {
        private readonly CitizenChangeDispatcher _dispatcher;

        public CitizenChangeInterceptor(CitizenChangeDispatcher dispatcher) => _dispatcher = dispatcher;

        public override InterceptionResult<int> SavingChanges(DbContextEventData eventData, InterceptionResult<int> result)
        {
            _dispatcher.Capture(eventData.Context);
            return result;
        }

        public override ValueTask<InterceptionResult<int>> SavingChangesAsync(
            DbContextEventData eventData, InterceptionResult<int> result, CancellationToken cancellationToken = default)
        {
            _dispatcher.Capture(eventData.Context);
            return ValueTask.FromResult(result);
        }

        public override int SavedChanges(SaveChangesCompletedEventData eventData, int result)
        {
            _dispatcher.AfterSaveAsync(eventData.Context, CancellationToken.None).GetAwaiter().GetResult();
            return result;
        }

        public override async ValueTask<int> SavedChangesAsync(
            SaveChangesCompletedEventData eventData, int result, CancellationToken cancellationToken = default)
        {
            await _dispatcher.AfterSaveAsync(eventData.Context, cancellationToken);
            return result;
        }

        public override void SaveChangesFailed(DbContextErrorEventData eventData) => _dispatcher.Discard(eventData.Context);

        public override Task SaveChangesFailedAsync(DbContextErrorEventData eventData, CancellationToken cancellationToken = default)
        {
            _dispatcher.Discard(eventData.Context);
            return Task.CompletedTask;
        }
    }

    // Flushes changes that were saved inside an explicit transaction once it commits
    public sealed class CitizenChangeTransactionInterceptor : DbTransactionInterceptor
    {
        private readonly CitizenChangeDispatcher _dispatcher;

        public CitizenChangeTransactionInterceptor(CitizenChangeDispatcher dispatcher) => _dispatcher = dispatcher;

        public override void TransactionCommitted(DbTransaction transaction, TransactionEndEventData eventData) =>
            _dispatcher.FlushAsync(eventData.Context, CancellationToken.None).GetAwaiter().GetResult();

        public override Task TransactionCommittedAsync(DbTransaction transaction, TransactionEndEventData eventData, CancellationToken cancellationToken = default) =>
            _dispatcher.FlushAsync(eventData.Context, cancellationToken);

        public override void TransactionRolledBack(DbTransaction transaction, TransactionEndEventData eventData) =>
            _dispatcher.Discard(eventData.Context);

        public override Task TransactionRolledBackAsync(DbTransaction transaction, TransactionEndEventData eventData, CancellationToken cancellationToken = default)
        {
            _dispatcher.Discard(eventData.Context);
            return Task.CompletedTask;
        }
    }

    /// <summary>Shared state and the NIC resolution behind both interceptors. Singleton.</summary>
    public sealed class CitizenChangeDispatcher
    {
        // Entities captured per DbContext instance; the entry disappears with the context
        private readonly ConditionalWeakTable<DbContext, PendingChanges> _pending = new();
        private readonly IServiceScopeFactory _scopeFactory;
        private readonly ICitizenChangeNotifier _notifier;
        private readonly ILogger<CitizenChangeDispatcher> _logger;

        public CitizenChangeDispatcher(IServiceScopeFactory scopeFactory, ICitizenChangeNotifier notifier, ILogger<CitizenChangeDispatcher> logger)
        {
            _scopeFactory = scopeFactory;
            _notifier = notifier;
            _logger = logger;
        }

        private sealed class PendingChanges
        {
            // Saved entities are kept by reference: generated ids and foreign keys are only
            // filled in after the save, which is when they are read
            public List<object> Saved { get; } = new();
            // Entities of the current SaveChanges call, before it completes
            public List<object> Saving { get; } = new();
            public bool CatalogChanged { get; set; }
        }

        public void Capture(DbContext? context)
        {
            if (context is not AppDbContext) return;
            var pending = _pending.GetOrCreateValue(context);
            pending.Saving.Clear();

            foreach (var entry in context.ChangeTracker.Entries())
            {
                if (entry.State is not (EntityState.Added or EntityState.Modified or EntityState.Deleted)) continue;

                switch (entry.Entity)
                {
                    case VerificationTask or ApplicationSubmission or Payment or InstallmentPlan
                        or Installment or CitizenNotification or RefundRequest:
                        pending.Saving.Add(entry.Entity);
                        break;
                    case ServiceProcedure or Template or FormField or FeeSchedule
                        or EligibilityRule or DocumentRequirement or Department:
                        pending.CatalogChanged = true;
                        break;
                }
            }
        }

        public async Task AfterSaveAsync(DbContext? context, CancellationToken cancellationToken)
        {
            if (context is not AppDbContext || !_pending.TryGetValue(context, out var pending)) return;
            pending.Saved.AddRange(pending.Saving);
            pending.Saving.Clear();

            // Inside a transaction: wait for TransactionCommitted
            if (context.Database.CurrentTransaction != null) return;
            await FlushAsync(context, cancellationToken);
        }

        public void Discard(DbContext? context)
        {
            if (context != null) _pending.Remove(context);
        }

        public async Task FlushAsync(DbContext? context, CancellationToken cancellationToken)
        {
            if (context == null || !_pending.TryGetValue(context, out var pending)) return;
            _pending.Remove(context);
            if (pending.Saved.Count == 0 && !pending.CatalogChanged) return;

            // A failed cache refresh or push must never fail the write that already committed
            try
            {
                if (pending.CatalogChanged)
                {
                    await _notifier.CatalogChangedAsync(cancellationToken);
                }
                if (pending.Saved.Count > 0)
                {
                    await NotifyCitizensAsync(pending.Saved, cancellationToken);
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Change notification failed; clients will catch up on their next poll");
            }
        }

        private async Task NotifyCitizensAsync(List<object> saved, CancellationToken cancellationToken)
        {
            var nics = new HashSet<string>();
            var appIds = new HashSet<int>();
            var paymentIds = new HashSet<int>();
            var planIds = new HashSet<int>();
            var refunds = new List<RefundRequest>();
            var officerQueueChanged = false;

            foreach (var entity in saved)
            {
                switch (entity)
                {
                    case VerificationTask t:
                        if (!string.IsNullOrEmpty(t.CitizenNic)) nics.Add(Validation.SriLankaNic.Normalize(t.CitizenNic));
                        appIds.Add(t.ApplicationId);
                        officerQueueChanged = true;
                        break;
                    case ApplicationSubmission s:
                        if (!string.IsNullOrEmpty(s.CitizenNic)) nics.Add(Validation.SriLankaNic.Normalize(s.CitizenNic));
                        officerQueueChanged = true;
                        break;
                    case Payment p:
                        appIds.Add(p.ApplicationId);
                        officerQueueChanged = true;
                        break;
                    case CitizenNotification n:
                        if (!string.IsNullOrEmpty(n.CitizenNic)) nics.Add(Validation.SriLankaNic.Normalize(n.CitizenNic));
                        break;
                    case InstallmentPlan plan:
                        paymentIds.Add(plan.PaymentId);
                        break;
                    case Installment installment:
                        planIds.Add(installment.InstallmentPlanId);
                        break;
                    case RefundRequest refund:
                        paymentIds.Add(refund.PaymentId);
                        refunds.Add(refund);
                        break;
                }
            }

            // Resolve plans -> payments -> applications -> citizen NICs on a fresh, read-only context
            Dictionary<int, int> appByPayment = new();
            Dictionary<int, string> nicByApp = new();
            using (var scope = _scopeFactory.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

                if (planIds.Count > 0)
                {
                    var planPayments = await db.InstallmentPlans.AsNoTracking()
                        .Where(p => planIds.Contains(p.Id))
                        .Select(p => p.PaymentId)
                        .ToListAsync(cancellationToken);
                    paymentIds.UnionWith(planPayments);
                }

                if (paymentIds.Count > 0)
                {
                    appByPayment = await db.Payments.AsNoTracking()
                        .Where(p => paymentIds.Contains(p.Id))
                        .ToDictionaryAsync(p => p.Id, p => p.ApplicationId, cancellationToken);
                    appIds.UnionWith(appByPayment.Values);
                }

                appIds.Remove(0);
                if (appIds.Count > 0)
                {
                    var subNics = await db.ApplicationSubmissions.AsNoTracking()
                        .Where(s => appIds.Contains(s.Id) && s.CitizenNic != "")
                        .Select(s => new { s.Id, s.CitizenNic })
                        .ToListAsync(cancellationToken);

                    foreach (var s in subNics)
                    {
                        var norm = Validation.SriLankaNic.Normalize(s.CitizenNic);
                        nicByApp[s.Id] = norm;
                        nics.Add(norm);
                    }
                }
            }

            await _notifier.ApplicationsChangedAsync(nics, cancellationToken);

            if (refunds.Count > 0)
            {
                var refundIdsByNic = new Dictionary<string, List<int>>();
                foreach (var refund in refunds)
                {
                    if (!appByPayment.TryGetValue(refund.PaymentId, out var appId) || !nicByApp.TryGetValue(appId, out var nic)) continue;
                    if (!refundIdsByNic.TryGetValue(nic, out var ids)) refundIdsByNic[nic] = ids = new List<int>();
                    ids.Add(refund.Id);
                }
                await _notifier.RefundsChangedAsync(refundIdsByNic, cancellationToken);
            }

            if (officerQueueChanged)
            {
                await _notifier.OfficerQueueChangedAsync(cancellationToken);
            }
        }
    }
}
