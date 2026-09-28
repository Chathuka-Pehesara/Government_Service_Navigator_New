using System.Text.Json;
using Government_Service_Navigator.Backend.Data.Context;
using Government_Service_Navigator.Backend.DTOs.Responses;
using Government_Service_Navigator.Backend.Services.Interfaces;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Hybrid;

namespace Government_Service_Navigator.Backend.Services
{
    /// <summary>
    /// Builds the citizen app's application list. Every query is read-only and projected to the
    /// columns the card needs (no templates with all fields, no full fee schedules).
    /// The result is cached per citizen; CitizenChangeInterceptor clears it on every relevant commit,
    /// so the expiry below is only a safety net.
    /// </summary>
    public class CitizenApplicationsService : ICitizenApplicationsService
    {
        private readonly AppDbContext _context;
        private readonly IVerificationService _verificationService;
        private readonly HybridCache _cache;

        private static readonly HybridCacheEntryOptions CacheOptions = new()
        {
            Expiration = TimeSpan.FromMinutes(5),
            // Short, because another API instance's in-memory copy is not cleared by tag invalidation
            LocalCacheExpiration = TimeSpan.FromSeconds(10)
        };

        public CitizenApplicationsService(AppDbContext context, IVerificationService verificationService, HybridCache cache)
        {
            _context = context;
            _verificationService = verificationService;
            _cache = cache;
        }

        public async Task<List<MyApplicationDto>> GetMyApplicationsAsync(string nic, CancellationToken cancellationToken = default) =>
            await _cache.GetOrCreateAsync(
                CacheKeys.CitizenApplications(nic),
                async token => await BuildAsync(nic, token),
                CacheOptions,
                new[] { CacheKeys.CitizenTag(nic) },
                cancellationToken);

        private async Task<List<MyApplicationDto>> BuildAsync(string nic, CancellationToken cancellationToken)
        {
            var tasks = await _verificationService.GetTasksForCitizenAsync(nic);
            if (tasks.Count == 0) return new List<MyApplicationDto>();

            var appIds = tasks.Select(t => t.ApplicationId).Distinct().ToList();

            // Service name/department, stage metadata and the procedure's latest fee for each submission
            var services = await _context.ApplicationSubmissions
                .AsNoTracking()
                .Where(s => appIds.Contains(s.Id) && s.CitizenNic == nic)
                .Select(s => new
                {
                    s.Id,
                    s.ServiceProcedureId,
                    s.UserEmail,
                    s.CurrentStage,
                    s.MaxStages,
                    s.StageStatus,
                    s.CurrentDepartment,
                    ServiceName = s.ServiceProcedure!.Name,
                    s.ServiceProcedure.Category,
                    s.ServiceProcedure.WorkflowDepartments,
                    LatestFee = s.ServiceProcedure.FeeSchedules
                        .OrderByDescending(f => f.EffectiveDate)
                        .Select(f => (decimal?)f.Amount)
                        .FirstOrDefault()
                })
                .ToDictionaryAsync(s => s.Id, cancellationToken);

            // Only whether each active stage template has a payment field, and that field's options
            var spIds = services.Values.Select(s => (int?)s.ServiceProcedureId).Distinct().ToList();
            var templates = await _context.Templates
                .AsNoTracking()
                .Where(t => spIds.Contains(t.ServiceProcedureId) && t.Status == "Active")
                .Select(t => new
                {
                    t.ServiceProcedureId,
                    t.StageOrder,
                    HasPaymentField = t.Fields.Any(f => f.Type == "payment"),
                    PaymentOptions = t.Fields.Where(f => f.Type == "payment").Select(f => f.Options).FirstOrDefault()
                })
                .ToListAsync(cancellationToken);

            // Latest installment plan per application, so the app can open its schedule from the application card
            var plans = await _context.InstallmentPlans
                .AsNoTracking()
                .Where(p => appIds.Contains(p.Payment!.ApplicationId))
                .Select(p => new
                {
                    p.Id,
                    p.Payment!.ApplicationId,
                    p.Status,
                    p.NumberOfInstallments,
                    PaidCount = p.Installments!.Count(i => i.Status == "Paid"),
                    Next = p.Installments!
                        .Where(i => i.Status != "Paid")
                        .OrderBy(i => i.InstallmentNumber)
                        .Select(i => new { i.Amount, i.DueDate, i.Status })
                        .FirstOrDefault()
                })
                .ToListAsync(cancellationToken);
            var planByApp = plans
                .GroupBy(p => p.ApplicationId)
                .ToDictionary(g => g.Key, g => g.OrderByDescending(p => p.Id).First());

            // Latest payment per application (real-time paymentStatus and isPaymentVerified)
            var payments = await _context.Payments
                .AsNoTracking()
                .Where(p => appIds.Contains(p.ApplicationId))
                .OrderByDescending(p => p.Id)
                .Select(p => new { p.ApplicationId, p.Status, p.Method, p.Amount })
                .ToListAsync(cancellationToken);
            var paymentByApp = payments
                .GroupBy(p => p.ApplicationId)
                .ToDictionary(g => g.Key, g => g.First());

            // One entry per application: the task for the submission's current stage, else the newest
            var activeTasks = tasks
                .GroupBy(t => t.ApplicationId)
                .Select(g =>
                {
                    services.TryGetValue(g.Key, out var sub);
                    var activeStage = sub?.CurrentStage ?? 1;
                    return g.FirstOrDefault(t => t.StageNumber == activeStage || t.CurrentStage == activeStage)
                           ?? g.OrderByDescending(t => t.Id).First();
                })
                .ToList();

            return activeTasks.Select(t =>
            {
                services.TryGetValue(t.ApplicationId, out var s);
                var currentStageNum = s?.CurrentStage ?? (t.CurrentStage > 0 ? t.CurrentStage : 1);
                var stageTemplate = s == null
                    ? null
                    : templates.FirstOrDefault(tmpl =>
                        tmpl.ServiceProcedureId == s.ServiceProcedureId &&
                        tmpl.StageOrder == currentStageNum);
                var procFee = (double)(s?.LatestFee ?? 0m);

                bool isStagePaymentRequired = false;
                double stageFeeAmount = 0.0;

                if (stageTemplate != null)
                {
                    if (stageTemplate.HasPaymentField)
                    {
                        isStagePaymentRequired = true;
                        if (!string.IsNullOrWhiteSpace(stageTemplate.PaymentOptions))
                        {
                            try
                            {
                                using var pDoc = JsonDocument.Parse(stageTemplate.PaymentOptions);
                                if (pDoc.RootElement.TryGetProperty("amount", out var a))
                                {
                                    stageFeeAmount = (double)a.GetDecimal();
                                }
                            }
                            catch { }
                        }
                        if (stageFeeAmount <= 0.0)
                        {
                            stageFeeAmount = procFee;
                        }
                    }
                    // An explicit stage template with no payment field means this stage has no payment
                }
                else if ((s?.MaxStages ?? 1) <= 1 && procFee > 0)
                {
                    // No stage template: fall back only for a single stage procedure with a fee schedule
                    isStagePaymentRequired = true;
                    stageFeeAmount = procFee;
                }

                var pay = paymentByApp.TryGetValue(t.ApplicationId, out var pObj) ? pObj : null;
                bool isPayVerified;
                string paymentStatus;

                if (isStagePaymentRequired)
                {
                    if (pay != null)
                    {
                        paymentStatus = pay.Status;
                        isPayVerified = pay.Status == "Paid" || pay.Status == "Verified";
                    }
                    else
                    {
                        paymentStatus = stageFeeAmount > 0 ? "AwaitingFeePayment" : "None";
                        isPayVerified = false;
                    }
                }
                else
                {
                    paymentStatus = "None";
                    isPayVerified = true;
                }

                var effectiveStatus = t.Status;
                var isUnsubmittedStage = s != null && s.CurrentStage > t.StageNumber;

                if (isUnsubmittedStage)
                {
                    effectiveStatus = s!.StageStatus == "StageApproved" ? "StageApproved" : "Draft";
                }
                else if ((s?.StageStatus == "UnderVerification" || s?.StageStatus == "PendingReview") && effectiveStatus == "Approved")
                {
                    effectiveStatus = "Pending";
                }

                var resolvedStageStatus = s?.StageStatus;
                if (isUnsubmittedStage)
                {
                    if (string.IsNullOrEmpty(resolvedStageStatus) || resolvedStageStatus == "UnderVerification" || resolvedStageStatus == "PendingReview")
                    {
                        resolvedStageStatus = "Draft";
                    }
                }
                else if (string.IsNullOrEmpty(resolvedStageStatus))
                {
                    resolvedStageStatus = effectiveStatus == "Approved" ? "Completed" : "PendingReview";
                }

                return new MyApplicationDto
                {
                    Id = t.Id,
                    ApplicationId = t.ApplicationId,
                    Status = effectiveStatus,
                    CreatedDate = t.CreatedDate,
                    ReferenceNumber = $"APP-{t.ApplicationId}",
                    ServiceName = s?.ServiceName,
                    Category = s?.Category,
                    Department = t.Department ?? s?.CurrentDepartment,
                    CurrentDepartment = s?.CurrentDepartment,
                    WorkflowDepartments = s?.WorkflowDepartments,
                    ServiceProcedureId = s?.ServiceProcedureId ?? 0,
                    CurrentStage = currentStageNum,
                    MaxStages = t.MaxStages > 0 ? t.MaxStages : (s?.MaxStages ?? 1),
                    StageStatus = resolvedStageStatus,
                    Amount = stageFeeAmount,
                    UserEmail = s?.UserEmail ?? string.Empty,
                    PaymentStatus = paymentStatus,
                    IsPaymentVerified = isPayVerified,
                    IsStagePaymentRequired = isStagePaymentRequired,
                    PaymentMethod = pay?.Method,
                    PaymentAmount = pay != null ? (double)pay.Amount : stageFeeAmount,
                    InstallmentPlan = planByApp.TryGetValue(t.ApplicationId, out var plan)
                        ? new MyApplicationInstallmentPlanDto
                        {
                            PlanId = plan.Id,
                            Status = plan.Status,
                            NumberOfInstallments = plan.NumberOfInstallments,
                            PaidCount = plan.PaidCount,
                            NextAmount = plan.Next?.Amount,
                            NextDueDate = plan.Next?.DueDate,
                            NextStatus = plan.Next?.Status
                        }
                        : null
                };
            }).ToList();
        }
    }
}
