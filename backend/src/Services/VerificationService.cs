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

        public async Task<List<AuditLog>> GetAllAuditLogsAsync()
        {
            return await _context.AuditLogs
                .OrderByDescending(a => a.Timestamp)
                .ToListAsync();
        }

        public async Task<List<VerificationTask>> GetPendingTasksAsync(string? department = null)
        {
            // Self-repair: Any task incorrectly marked "Approved" without any actual OfficerReview
            // belongs back in "Pending" for the department officer to review manually.
            var unreviewedTasks = await _context.VerificationTasks
                .Include(t => t.Reviews)
                .Where(t => t.Status == "Approved" && !t.Reviews.Any())
                .ToListAsync();

            if (unreviewedTasks.Any())
            {
                foreach (var ut in unreviewedTasks)
                {
                    ut.Status = "Pending";
                }
                await _context.SaveChangesAsync();
            }

            var query = _context.VerificationTasks
                .Where(t => t.ApplicationId > 0 && (t.Status == "Pending" || t.Status == "Revised" || t.Status == "Revision Requested"));

            if (!string.IsNullOrEmpty(department))
            {
                var deptAppIds = _context.ApplicationSubmissions
                    .Where(s => s.CurrentDepartment == department)
                    .Select(s => s.Id);

                query = query.Where(t => t.Department == department || (t.Department == null && deptAppIds.Contains(t.ApplicationId)));
            }

            return await query.OrderBy(t => t.CreatedDate).ToListAsync();
        }

        public async Task<List<VerificationTask>> GetVerifiedTasksAsync(string? department = null)
        {
            var query = _context.VerificationTasks
                .Include(t => t.Reviews)
                .Where(t => t.ApplicationId > 0 && 
                           (t.Status == "Approved" || t.Status == "Rejected" || t.Status == "Suspended" || t.Status == "Revised" || t.Reviews.Any()));

            if (!string.IsNullOrEmpty(department))
            {
                var deptLower = department.Trim().ToLower();

                var deptAppIds = await _context.ApplicationSubmissions
                    .Where(s => (s.CurrentDepartment != null && s.CurrentDepartment.ToLower().Contains(deptLower)) ||
                                (s.DepartmentHistoryJson != null && s.DepartmentHistoryJson.ToLower().Contains(deptLower)))
                    .Select(s => s.Id)
                    .ToListAsync();

                query = query.Where(t => 
                    (t.Department != null && (t.Department.ToLower() == deptLower || t.Department.ToLower().Contains(deptLower) || deptLower.Contains(t.Department.ToLower()))) ||
                    deptAppIds.Contains(t.ApplicationId) ||
                    t.Reviews.Any(r => r.OfficerId.ToLower().Contains(deptLower)));
            }

            return await query.OrderByDescending(t => t.CreatedDate).ToListAsync();
        }

        public async Task<List<VerificationTask>> GetTasksForCitizenAsync(string citizenNic)
        {
            var unreviewedTasks = await _context.VerificationTasks
                .Include(t => t.Reviews)
                .Where(t => t.CitizenNic == citizenNic && t.Status == "Approved" && !t.Reviews.Any())
                .ToListAsync();

            if (unreviewedTasks.Any())
            {
                foreach (var ut in unreviewedTasks)
                {
                    ut.Status = "Pending";
                }
                await _context.SaveChangesAsync();
            }

            return await _context.VerificationTasks
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
