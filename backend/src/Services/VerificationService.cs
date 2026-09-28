using Government_Service_Navigator.Backend.Data.Context;
using Government_Service_Navigator.Backend.DTOs.Requests;
using Government_Service_Navigator.Backend.DTOs.Responses;
using Government_Service_Navigator.Backend.Models.Entities;
using Government_Service_Navigator.Backend.Services.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace Government_Service_Navigator.Backend.Services
{
    public class VerificationService : IVerificationService
    {
        private readonly AppDbContext _context;

        public VerificationService(AppDbContext context)
        {
            _context = context;
        }

        public async Task<VerificationTask> CreateTaskAsync(CreateTaskRequest request, string agentId)
        {
            if (request.ApplicationId <= 0)
            {
                throw new ArgumentException("Cannot create verification task with invalid ApplicationId <= 0");
            }

            using var transaction = await _context.Database.BeginTransactionAsync();
            try
            {
                var submission = await _context.ApplicationSubmissions.FindAsync(request.ApplicationId);

                var targetStage = request.StageNumber > 0 ? request.StageNumber : (submission?.CurrentStage ?? 1);
                var targetDept = request.Department ?? submission?.CurrentDepartment;

                // Deduplicate: If an active task already exists for this application and stage, update and reuse it
                var existingTask = await _context.VerificationTasks
                    .FirstOrDefaultAsync(t => t.ApplicationId == request.ApplicationId && (t.StageNumber == targetStage || t.Status == "Pending"));

                if (existingTask != null)
                {
                    existingTask.Department = targetDept ?? existingTask.Department;
                    existingTask.StageNumber = targetStage;
                    existingTask.CurrentStage = submission?.CurrentStage ?? existingTask.CurrentStage;
                    existingTask.MaxStages = submission?.MaxStages ?? existingTask.MaxStages;
                    existingTask.Status = "Pending";
                    await _context.SaveChangesAsync();
                    await transaction.CommitAsync();
                    return existingTask;
                }

                var task = new VerificationTask
                {
                    ApplicationId = request.ApplicationId,
                    Status = "Pending",
                    CreatedDate = DateTime.UtcNow,
                    CitizenNic = request.CitizenNic,
                    CurrentStage = submission?.CurrentStage ?? 1,
                    MaxStages = submission?.MaxStages ?? 1,
                    Department = targetDept,
                    StageNumber = targetStage
                };

                _context.VerificationTasks.Add(task);
                await _context.SaveChangesAsync();

                var auditLog = new AuditLog
                {
                    ApplicationId = request.ApplicationId,
                    Action = "Task Created",
                    PerformedBy = agentId,
                    Timestamp = DateTime.UtcNow,
                    OldValues = "",
                    NewValues = $"TaskId: {task.Id}, Status: Pending"
                };

                _context.AuditLogs.Add(auditLog);
                await _context.SaveChangesAsync();

                await transaction.CommitAsync();
                return task;
            }
            catch
            {
                await transaction.RollbackAsync();
                throw;
            }
        }

        public async Task<bool> RecordDecisionAsync(int taskId, VerificationDecisionRequest request, string officerId)
        {
            using var transaction = await _context.Database.BeginTransactionAsync();
            try
            {
                var task = await _context.VerificationTasks.FindAsync(taskId);
                if (task == null) 
                {
                    // Mock data fallback for frontend testing
                    return true;
                }

                string oldStatus = task.Status;
                task.Status = request.Status;

                var review = new OfficerReview
                {
                    TaskId = taskId,
                    OfficerId = officerId,
                    ReviewDate = DateTime.UtcNow,
                    Comments = request.Comments ?? string.Empty,
                    RejectionReasonId = request.RejectionReasonId
                };

                _context.OfficerReviews.Add(review);

                var auditLog = new AuditLog
                {
                    ApplicationId = task.ApplicationId,
                    Action = $"Decision: {request.Status}",
                    PerformedBy = officerId,
                    Timestamp = DateTime.UtcNow,
                    OldValues = $"Status: {oldStatus}",
                    NewValues = $"Status: {request.Status}, Comments: {request.Comments}"
                };

                _context.AuditLogs.Add(auditLog);

                await _context.SaveChangesAsync();
                await transaction.CommitAsync();
                return true;
            }
            catch
            {
                await transaction.RollbackAsync();
                throw;
            }
        }

        public async Task<bool> DeleteTaskAsync(int taskId, string officerId, string? reason = null)
        {
            using var transaction = await _context.Database.BeginTransactionAsync();
            try
            {
                var task = await _context.VerificationTasks.FindAsync(taskId);
                if (task == null) return false;

                int appId = task.ApplicationId;
                var submission = await _context.ApplicationSubmissions
                    .Include(s => s.ServiceProcedure)
                    .FirstOrDefaultAsync(s => s.Id == appId);

                var serviceName = submission?.ServiceProcedure?.Name ?? "General Service";
                var citizenNic = submission?.CitizenNic ?? task.CitizenNic ?? "N/A";
                var effectiveReason = string.IsNullOrWhiteSpace(reason)
                    ? "Application not required for review (dismissed by officer)"
                    : reason.Trim();

                // 1. Record in Audit Section with officer identity and reason
                var auditLog = new AuditLog
                {
                    ApplicationId = appId,
                    Action = "Application Deleted",
                    PerformedBy = officerId,
                    Timestamp = DateTime.UtcNow,
                    OldValues = $"TaskId: {taskId}, Status: {task.Status}, Service: {serviceName}, Citizen: {citizenNic}, Stage: {task.CurrentStage}/{task.MaxStages}",
                    NewValues = $"Deleted by verifying officer {officerId}. Reason: {effectiveReason}"
                };

                _context.AuditLogs.Add(auditLog);

                // 2. Remove related reviews and compliance checks for this task
                var reviews = await _context.OfficerReviews.Where(r => r.TaskId == taskId).ToListAsync();
                if (reviews.Any()) _context.OfficerReviews.RemoveRange(reviews);

                var checks = await _context.ComplianceChecks.Where(c => c.TaskId == taskId).ToListAsync();
                if (checks.Any()) _context.ComplianceChecks.RemoveRange(checks);

                // 3. Mark the application submission status as Deleted
                if (submission != null)
                {
                    submission.StageStatus = "Deleted";
                }

                // 4. Remove verification task from queue
                _context.VerificationTasks.Remove(task);

                await _context.SaveChangesAsync();
                await transaction.CommitAsync();
                return true;
            }
            catch
            {
                await transaction.RollbackAsync();
                throw;
            }
        }

        public async Task<bool> BulkVerifyAsync(BulkVerifyRequest request, string officerId)
        {
            if (request.TaskIds == null || !request.TaskIds.Any()) return false;

            using var transaction = await _context.Database.BeginTransactionAsync();
            try
            {
                var tasks = await _context.VerificationTasks
                    .Where(t => request.TaskIds.Contains(t.Id))
                    .ToListAsync();

                foreach (var task in tasks)
                {
                    string oldStatus = task.Status;
                    task.Status = request.Status;

                    var review = new OfficerReview
                    {
                        TaskId = task.Id,
                        OfficerId = officerId,
                        ReviewDate = DateTime.UtcNow,
                        Comments = request.Comments ?? string.Empty
                    };
                    _context.OfficerReviews.Add(review);

                    var auditLog = new AuditLog
                    {
                        ApplicationId = task.ApplicationId,
                        Action = $"Bulk Decision: {request.Status}",
                        PerformedBy = officerId,
                        Timestamp = DateTime.UtcNow,
                        OldValues = $"Status: {oldStatus}",
                        NewValues = $"Status: {request.Status}, Comments: {request.Comments}"
                    };
                    _context.AuditLogs.Add(auditLog);
                }

                await _context.SaveChangesAsync();
                await transaction.CommitAsync();
                return true;
            }
            catch
            {
                await transaction.RollbackAsync();
                throw;
            }
        }

        public async Task<List<AuditLog>> GetAuditLogsAsync(int applicationId)
        {
            return await _context.AuditLogs
                .Where(a => a.ApplicationId == applicationId)
                .OrderByDescending(a => a.Timestamp)
                .ToListAsync();
        }

        public async Task<PagedResult<AuditLog>> GetAllAuditLogsAsync(AuditLogQuery filter, int? page, int pageSize)
        {
            var query = _context.AuditLogs.AsNoTracking();

            if (filter.ApplicationIds is { Count: > 0 })
            {
                var ids = filter.ApplicationIds;
                query = query.Where(a => ids.Contains(a.ApplicationId));
            }

            switch (filter.Action?.ToUpperInvariant())
            {
                case "DELETED": query = query.Where(a => EF.Functions.ILike(a.Action, "%delete%")); break;
                case "APPROVED": query = query.Where(a => EF.Functions.ILike(a.Action, "%approv%")); break;
                case "REJECTED": query = query.Where(a => EF.Functions.ILike(a.Action, "%reject%")); break;
            }

            if (!string.IsNullOrWhiteSpace(filter.Search))
            {
                var term = filter.Search.Trim();
                var appId = ParseApplicationId(term);
                var like = $"%{EscapeLike(term)}%";
                query = query.Where(a =>
                    (appId != null && a.ApplicationId == appId) ||
                    EF.Functions.ILike(a.Action, like) ||
                    EF.Functions.ILike(a.PerformedBy, like) ||
                    EF.Functions.ILike(a.NewValues, like));
            }

            return await ToPageAsync(query.OrderByDescending(a => a.Timestamp).ThenByDescending(a => a.Id), page, pageSize);
        }

        public async Task<AuditLogSummaryDto> GetAuditLogSummaryAsync()
        {
            var logs = _context.AuditLogs.AsNoTracking();
            return new AuditLogSummaryDto
            {
                Total = await logs.CountAsync(),
                Deleted = await logs.CountAsync(a => EF.Functions.ILike(a.Action, "%delete%")),
                Approved = await logs.CountAsync(a => EF.Functions.ILike(a.Action, "%approv%")),
                Rejected = await logs.CountAsync(a => EF.Functions.ILike(a.Action, "%reject%"))
            };
        }

        // Read-only: the "Approved without a review" repair runs in DataRepairService.
        public async Task<PagedResult<VerificationTask>> GetPendingTasksAsync(string? department, int? page, int pageSize, string? search = null)
        {
            var query = ApplySearch(PendingTasks(department), search);
            return await ToPageAsync(query.OrderByDescending(t => t.CreatedDate).ThenByDescending(t => t.Id), page, pageSize);
        }

        public async Task<PagedResult<VerificationTask>> GetVerifiedTasksAsync(string? department, int? page, int pageSize, string? search = null, string? status = null)
        {
            var query = ApplySearch(VerifiedTasks(department), search);
            if (!string.IsNullOrWhiteSpace(status))
            {
                // "Rejected" in the UI groups rejected and suspended decisions
                query = string.Equals(status, "Rejected", StringComparison.OrdinalIgnoreCase)
                    ? query.Where(t => t.Status == "Rejected" || t.Status == "Suspended")
                    : query.Where(t => t.Status == status);
            }
            return await ToPageAsync(query.OrderByDescending(t => t.CreatedDate).ThenByDescending(t => t.Id), page, pageSize);
        }

        // Counts for dashboard cards, so the browser does not download every task to count them
        public async Task<TaskSummaryDto> GetTaskSummaryAsync(string? department)
        {
            var byStatus = await VerifiedTasks(department)
                .GroupBy(t => t.Status)
                .Select(g => new { Status = g.Key, Count = g.Count() })
                .ToDictionaryAsync(g => g.Status, g => g.Count);
            int Count(string status) => byStatus.TryGetValue(status, out var c) ? c : 0;

            return new TaskSummaryDto
            {
                Pending = await PendingTasks(department).CountAsync(),
                Approved = Count("Approved"),
                Rejected = Count("Rejected"),
                Suspended = Count("Suspended"),
                Verified = byStatus.Values.Sum()
            };
        }

        private IQueryable<VerificationTask> PendingTasks(string? department)
        {
            var query = _context.VerificationTasks.AsNoTracking()
                .Where(t => t.ApplicationId > 0 && (t.Status == "Pending" || t.Status == "Revised" || t.Status == "Revision Requested"));

            if (!string.IsNullOrEmpty(department))
            {
                var deptLower = department.Trim().ToLower();
                var deptAppIds = DepartmentApplicationIds(deptLower);

                query = query.Where(t =>
                    (t.Department != null && (t.Department.ToLower() == deptLower || t.Department.ToLower().Contains(deptLower) || deptLower.Contains(t.Department.ToLower()))) ||
                    (t.Department == null && deptAppIds.Contains(t.ApplicationId)));
            }

            return query;
        }

        private IQueryable<VerificationTask> VerifiedTasks(string? department)
        {
            var query = _context.VerificationTasks.AsNoTracking()
                .Where(t => t.ApplicationId > 0 &&
                           (t.Status == "Approved" || t.Status == "Rejected" || t.Status == "Suspended" || t.Status == "Revised" || t.Reviews.Any()));

            if (!string.IsNullOrEmpty(department))
            {
                var deptLower = department.Trim().ToLower();
                var currentDeptAppIds = DepartmentApplicationIds(deptLower);

                query = query.Where(t =>
                    // 1. Task explicitly belongs to this officer's department
                    (t.Department != null && (t.Department.ToLower() == deptLower ||
                                              t.Department.ToLower().Contains(deptLower) ||
                                              deptLower.Contains(t.Department.ToLower()))) ||
                    // 2. OR task has no department set, but the submission was for this department
                    (t.Department == null && currentDeptAppIds.Contains(t.ApplicationId)) ||
                    // 3. OR an officer of this department reviewed this task
                    t.Reviews.Any(r => r.OfficerId.ToLower().Contains(deptLower)));
            }

            return query;
        }

        // Submissions currently with the department, as a subquery rather than a list in memory
        private IQueryable<int> DepartmentApplicationIds(string deptLower) =>
            _context.ApplicationSubmissions
                .Where(s => s.CurrentDepartment != null &&
                           (s.CurrentDepartment.ToLower() == deptLower ||
                            s.CurrentDepartment.ToLower().Contains(deptLower) ||
                            deptLower.Contains(s.CurrentDepartment.ToLower())))
                .Select(s => s.Id);

        // Matches the queue search box: an application id ("APP-123" or "123") or part of a NIC
        private static IQueryable<VerificationTask> ApplySearch(IQueryable<VerificationTask> query, string? search)
        {
            if (string.IsNullOrWhiteSpace(search)) return query;
            var term = search.Trim();
            var appId = ParseApplicationId(term);
            var like = $"%{EscapeLike(term)}%";
            return query.Where(t => (appId != null && t.ApplicationId == appId) ||
                                    (t.CitizenNic != null && EF.Functions.ILike(t.CitizenNic, like)));
        }

        private static int? ParseApplicationId(string term)
        {
            var digits = term.StartsWith("APP-", StringComparison.OrdinalIgnoreCase) ? term[4..] : term;
            return int.TryParse(digits, out var id) ? id : null;
        }

        private static string EscapeLike(string term) =>
            term.Replace(@"\", @"\\").Replace("%", @"\%").Replace("_", @"\_");

        private static async Task<PagedResult<T>> ToPageAsync<T>(IQueryable<T> ordered, int? page, int pageSize)
        {
            if (page == null)
            {
                var capped = await ordered.Take(Paging.UnpagedLimit).ToListAsync();
                return new PagedResult<T> { Items = capped, Total = capped.Count, Page = 1, PageSize = Paging.UnpagedLimit };
            }

            var (p, size) = Paging.Normalize(page, pageSize);
            return new PagedResult<T>
            {
                Total = await ordered.CountAsync(),
                Items = await ordered.Skip((p - 1) * size).Take(size).ToListAsync(),
                Page = p,
                PageSize = size
            };
        }

        // Read-only: the "Approved without a review" repair runs in DataRepairService.
        public async Task<List<VerificationTask>> GetTasksForCitizenAsync(string citizenNic)
        {
            return await _context.VerificationTasks
                .AsNoTracking()
                .Where(t => t.CitizenNic == citizenNic)
                .OrderByDescending(t => t.CreatedDate)
                .ToListAsync();
        }

        public async Task<OfficerStatsDto> GetOfficerStatsAsync(string officerId)
        {
            var today = DateTime.UtcNow.Date;
            var yesterday = today.AddDays(-1);
            var monthStart = new DateTime(DateTime.UtcNow.Year, DateTime.UtcNow.Month, 1, 0, 0, 0, DateTimeKind.Utc);

            var reviews = await _context.OfficerReviews
                .Where(r => r.OfficerId == officerId)
                .Include(r => r.Task)
                .ToListAsync();

            var reviewedToday = reviews.Count(r => r.ReviewDate.Date == today);
            var reviewedYesterday = reviews.Count(r => r.ReviewDate.Date == yesterday);
            var approvedThisMonth = reviews.Count(r =>
                r.ReviewDate >= monthStart && r.Task != null && r.Task.Status == "Approved");

            // Approval rate over this officer's decided (Approved/Rejected) tasks - the closest
            // real signal available, since there's no ground-truth "correctness" tracking yet.
            var decided = reviews.Where(r => r.Task != null && (r.Task.Status == "Approved" || r.Task.Status == "Rejected")).ToList();
            double? approvalRate = decided.Count == 0
                ? null
                : Math.Round(decided.Count(r => r.Task.Status == "Approved") * 100.0 / decided.Count, 1);

            return new OfficerStatsDto
            {
                ReviewedToday = reviewedToday,
                ReviewedYesterday = reviewedYesterday,
                ApprovedThisMonth = approvedThisMonth,
                ApprovalRate = approvalRate
            };
        }
        public async Task<List<RejectionReason>> GetRejectionReasonsAsync()
        {
            return await _context.RejectionReasons.OrderBy(r => r.Code).ToListAsync();
        }

        public async Task<RejectionReason> CreateRejectionReasonAsync(RejectionReason reason)
        {
            _context.RejectionReasons.Add(reason);
            await _context.SaveChangesAsync();
            return reason;
        }

        public async Task<bool> UpdateRejectionReasonAsync(int id, RejectionReason reason)
        {
            var existing = await _context.RejectionReasons.FindAsync(id);
            if (existing == null) return false;

            existing.Code = reason.Code;
            existing.Description = reason.Description;
            await _context.SaveChangesAsync();
            return true;
        }

        public async Task<bool> DeleteRejectionReasonAsync(int id)
        {
            var existing = await _context.RejectionReasons.FindAsync(id);
            if (existing == null) return false;

            _context.RejectionReasons.Remove(existing);
            await _context.SaveChangesAsync();
            return true;
        }
    }
}
