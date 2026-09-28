using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;
using Government_Service_Navigator.Backend.Data.Context;
using Government_Service_Navigator.Backend.DTOs.Requests;
using Government_Service_Navigator.Backend.Models.Entities;
using Government_Service_Navigator.Backend.Services;
using Government_Service_Navigator.Backend.Services.Interfaces;

namespace Government_Service_Navigator.Backend.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize] // Require JWT token
    public class VerificationController : ControllerBase
    {
        // Every staff role that can sign in to the web portal; citizens ("User") are excluded.
        private const string OfficerRoles =
            "Verifying Officer,Department Admin,Auditor,Finance Officer,Officer,Admin,System Admin";

        private readonly IVerificationService _verificationService;
        private readonly AppDbContext _context;
        private readonly IApplicationDraftingService _draftingService;

        public VerificationController(
            IVerificationService verificationService,
            AppDbContext context,
            IApplicationDraftingService draftingService)
        {
            _verificationService = verificationService;
            _context = context;
            _draftingService = draftingService;
        }

        // Officer queue rows: each task joined to its submitted application, service and citizen.
        private async Task<List<object>> WithApplicationDetailsAsync(List<VerificationTask> tasks)
        {
            var appIds = tasks.Select(t => t.ApplicationId).ToList();
            var submissions = await _context.ApplicationSubmissions
                .Where(s => appIds.Contains(s.Id))
                .Select(s => new {
                    s.Id,
                    s.CitizenNic,
                    ServiceName = s.ServiceProcedure!.Name,
                    s.ServiceProcedure.Category,
                    s.CurrentDepartment
                })
                .ToDictionaryAsync(s => s.Id);

            var nics = submissions.Values.Select(s => s.CitizenNic)
                .Concat(tasks.Select(t => t.CitizenNic ?? string.Empty))
                .Where(n => n != string.Empty)
                .Distinct()
                .ToList();
            var names = await _context.Users
                .Where(u => nics.Contains(u.NicNumber))
                .GroupBy(u => u.NicNumber)
                .Select(g => new { Nic = g.Key, g.First().FullName })
                .ToDictionaryAsync(u => u.Nic, u => u.FullName);

            var taskIds = tasks.Select(t => t.Id).ToList();
            var reviews = await _context.OfficerReviews
                .Where(r => taskIds.Contains(r.TaskId))
                .OrderByDescending(r => r.ReviewDate)
                .ToListAsync();
            var reviewByTask = reviews.GroupBy(r => r.TaskId).ToDictionary(g => g.Key, g => g.First());

            return tasks.Select(t =>
            {
                submissions.TryGetValue(t.ApplicationId, out var s);
                var nic = s?.CitizenNic ?? t.CitizenNic;
                reviewByTask.TryGetValue(t.Id, out var rev);
                return (object)new
                {
                    t.Id,
                    t.ApplicationId,
                    t.Status,
                    t.CreatedDate,
                    t.CurrentStage,
                    t.MaxStages,
                    Department = t.Department ?? s?.CurrentDepartment,
                    t.StageNumber,
                    ReferenceNumber = $"APP-{t.ApplicationId}",
                    CitizenNic = nic,
                    CitizenName = nic != null && names.TryGetValue(nic, out var name) ? name : null,
                    ServiceName = s?.ServiceName,
                    Category = s?.Category,
                    Comments = rev?.Comments ?? string.Empty
                };
            }).ToList();
        }

        private string GetCurrentOfficerId()
        {
            var email = User.FindFirstValue(ClaimTypes.Email) ??
                        User.FindFirst("email")?.Value;
            var dept = User.FindFirstValue("department") ?? User.FindFirst("department")?.Value;
            var name = User.FindFirst("fullName")?.Value ?? User.FindFirst(ClaimTypes.Name)?.Value;

            if (!string.IsNullOrWhiteSpace(email))
            {
                return !string.IsNullOrWhiteSpace(dept) ? $"{email} ({dept})" : email;
            }
            if (!string.IsNullOrWhiteSpace(name))
            {
                return !string.IsNullOrWhiteSpace(dept) ? $"{name} ({dept})" : name;
            }
            return User.FindFirstValue(ClaimTypes.NameIdentifier) ?? "Verifying Officer";
        }

        // Citizen view: only the applications submitted under the caller's own NIC.
        [HttpGet("my-applications")]
        public async Task<IActionResult> GetMyApplications()
        {
            var nic = User.FindFirstValue("nicNumber");
            if (string.IsNullOrWhiteSpace(nic)) return Ok(Array.Empty<object>());

            var tasks = await _verificationService.GetTasksForCitizenAsync(nic);

            // Attach the service name/department and stage metadata from the citizen's submissions so the app can label each entry.
            var appIds = tasks.Select(t => t.ApplicationId).ToList();
            var submissions = await _context.ApplicationSubmissions
                .Where(s => appIds.Contains(s.Id) && s.CitizenNic == nic)
                .Include(s => s.ServiceProcedure)
                    .ThenInclude(sp => sp!.FeeSchedules)
                .ToListAsync();

            var services = submissions.ToDictionary(s => s.Id);

            var spIds = submissions.Select(s => s.ServiceProcedureId).Distinct().ToList();
            var templates = await _context.Templates
                .Include(t => t.Fields)
                .Where(t => spIds.Contains(t.ServiceProcedureId ?? 0) && t.Status == "Active")
                .ToListAsync();

            // Latest installment plan per application, so the app can open its schedule from the application card
            var plans = await _context.InstallmentPlans
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
                .ToListAsync();
            var planByApp = plans
                .GroupBy(p => p.ApplicationId)
                .ToDictionary(g => g.Key, g => g.OrderByDescending(p => p.Id).First());

            // Payments for applications (to return real-time paymentStatus and isPaymentVerified)
            var appPayments = await _context.Payments
                .Where(p => appIds.Contains(p.ApplicationId))
                .OrderByDescending(p => p.Id)
                .ToListAsync();
            var paymentByApp = appPayments
                .GroupBy(p => p.ApplicationId)
                .ToDictionary(g => g.Key, g => g.First());

            return Ok(tasks.Select(t =>
            {
                services.TryGetValue(t.ApplicationId, out var s);
                var currentStageNum = t.CurrentStage > 0 ? t.CurrentStage : (s?.CurrentStage ?? 1);
                var stageTemplate = templates.FirstOrDefault(tmpl =>
                    tmpl.ServiceProcedureId == s?.ServiceProcedureId &&
                    tmpl.StageOrder == currentStageNum);

                var paymentField = stageTemplate?.Fields.FirstOrDefault(f => f.Type == "payment");
                bool isStagePaymentRequired = false;
                double stageFeeAmount = 0.0;

                if (stageTemplate != null)
                {
                    if (paymentField != null)
                    {
                        isStagePaymentRequired = true;
                        if (!string.IsNullOrWhiteSpace(paymentField.Options))
                        {
                            try
                            {
                                using var pDoc = JsonDocument.Parse(paymentField.Options);
                                if (pDoc.RootElement.TryGetProperty("amount", out var a))
                                {
                                    stageFeeAmount = (double)a.GetDecimal();
                                }
                            }
                            catch { }
                        }
                        if (stageFeeAmount <= 0.0)
                        {
                            var procFee = s?.ServiceProcedure?.FeeSchedules
                                .OrderByDescending(f => f.EffectiveDate)
                                .Select(f => (double?)f.Amount)
                                .FirstOrDefault() ?? 0.0;
                            stageFeeAmount = procFee;
                        }
                    }
                    else
                    {
                        // Explicit stage template exists, but has NO payment field!
                        // This stage does NOT have payment.
                        isStagePaymentRequired = false;
                        stageFeeAmount = 0.0;
                    }
                }
                else
                {
                    // No stage template found. Fall back only if single stage procedure with fee schedule
                    var procFee = s?.ServiceProcedure?.FeeSchedules
                        .OrderByDescending(f => f.EffectiveDate)
                        .Select(f => (double?)f.Amount)
                        .FirstOrDefault() ?? 0.0;
                    if ((s?.MaxStages ?? 1) <= 1 && procFee > 0)
                    {
                        isStagePaymentRequired = true;
                        stageFeeAmount = procFee;
                    }
                }

                var pay = paymentByApp.TryGetValue(t.ApplicationId, out var pObj) ? pObj : null;
                bool isPayVerified;
                string paymentStatus;

                if (isStagePaymentRequired)
                {
                    if (pay != null)
                    {
                        paymentStatus = pay.Status;
                        isPayVerified = (pay.Status == "Paid" || pay.Status == "Verified");
                    }
                    else
                    {
                        paymentStatus = stageFeeAmount > 0 ? "AwaitingFeePayment" : "None";
                        isPayVerified = false;
                    }
                }
                else
                {
                    // Payment NOT required for this stage
                    paymentStatus = "None";
                    isPayVerified = true;
                }

                return new
                {
                    t.Id,
                    t.ApplicationId,
                    t.Status,
                    t.CreatedDate,
                    ReferenceNumber = $"APP-{t.ApplicationId}",
                    ServiceName = s?.ServiceProcedure?.Name,
                    Category = s?.ServiceProcedure?.Category,
                    Department = t.Department ?? s?.CurrentDepartment,
                    CurrentDepartment = s?.CurrentDepartment,
                    WorkflowDepartments = s?.ServiceProcedure?.WorkflowDepartments,
                    ServiceProcedureId = s?.ServiceProcedureId ?? 0,
                    CurrentStage = currentStageNum,
                    MaxStages = t.MaxStages > 0 ? t.MaxStages : (s?.MaxStages ?? 1),
                    StageStatus = !string.IsNullOrEmpty(s?.StageStatus) ? s.StageStatus : (t.Status == "Approved" ? "Completed" : "PendingReview"),
                    Amount = stageFeeAmount,
                    UserEmail = s?.UserEmail ?? string.Empty,
                    PaymentStatus = paymentStatus,
                    IsPaymentVerified = isPayVerified,
                    IsStagePaymentRequired = isStagePaymentRequired,
                    PaymentMethod = pay?.Method,
                    PaymentAmount = pay != null ? (double)pay.Amount : stageFeeAmount,
                    InstallmentPlan = planByApp.TryGetValue(t.ApplicationId, out var plan)
                        ? new
                        {
                            PlanId = plan.Id,
                            plan.Status,
                            plan.NumberOfInstallments,
                            plan.PaidCount,
                            NextAmount = plan.Next?.Amount,
                            NextDueDate = plan.Next?.DueDate,
                            NextStatus = plan.Next?.Status
                        }
                        : null
                };
            }));
        }

        [Authorize(Roles = OfficerRoles)]
        [HttpGet("tasks/pending")]
        public async Task<IActionResult> GetPendingTasks()
        {
            var role = User.FindFirstValue(ClaimTypes.Role) ?? string.Empty;
            var dept = User.FindFirstValue("department") ?? User.FindFirst("department")?.Value;
            var isSystemAdmin = role.Contains("System Admin", StringComparison.OrdinalIgnoreCase) || role == "Admin";
            var deptScope = isSystemAdmin || string.IsNullOrEmpty(dept) ? null : dept;
            var tasks = await _verificationService.GetPendingTasksAsync(deptScope);
            return Ok(await WithApplicationDetailsAsync(tasks));
        }

        [Authorize(Roles = OfficerRoles)]
        [HttpGet("tasks/verified")]
        public async Task<IActionResult> GetVerifiedTasks()
        {
            var role = User.FindFirstValue(ClaimTypes.Role) ?? string.Empty;
            var dept = User.FindFirstValue("department") ?? User.FindFirst("department")?.Value;
            var isSystemAdmin = role.Contains("System Admin", StringComparison.OrdinalIgnoreCase) || role == "Admin";
            var deptScope = isSystemAdmin || string.IsNullOrEmpty(dept) ? null : dept;
            var tasks = await _verificationService.GetVerifiedTasksAsync(deptScope);
            return Ok(await WithApplicationDetailsAsync(tasks));
        }

        // Review workspace: the task plus the citizen's submitted form answers.
        [Authorize(Roles = OfficerRoles)]
        [HttpGet("tasks/{id:int}")]
        public async Task<IActionResult> GetTaskDetail(int id)
        {
            var task = await _context.VerificationTasks.FindAsync(id);
            if (task == null) return NotFound();

            var submission = await _context.ApplicationSubmissions.FindAsync(task.ApplicationId);

            var role = User.FindFirstValue(ClaimTypes.Role) ?? string.Empty;
            var dept = User.FindFirstValue("department") ?? User.FindFirst("department")?.Value;
            var isSystemAdmin = role.Contains("System Admin", StringComparison.OrdinalIgnoreCase) || role == "Admin";

            var taskDept = task.Department ?? submission?.CurrentDepartment;
            if (!isSystemAdmin && !string.IsNullOrEmpty(dept) && !string.IsNullOrEmpty(taskDept) && !string.Equals(taskDept, dept, StringComparison.OrdinalIgnoreCase))
            {
                return Forbid();
            }

            var summary = (await WithApplicationDetailsAsync(new List<VerificationTask> { task }))[0];

            Dictionary<string, string> answers = new();
            if (submission != null)
            {
                try { answers = JsonSerializer.Deserialize<Dictionary<string, string>>(submission.FormDataJson) ?? new(); }
                catch (JsonException) { }
            }

            // Metadata only; the officer fetches each file's bytes from documents/{id}/content
            var documents = await _context.SubmissionDocuments
                .Where(d => d.ApplicationId == task.ApplicationId)
                .OrderBy(d => d.UploadedAt)
                .Select(d => new { d.Id, d.FieldLabel, d.FileName, d.ContentType, d.SizeBytes, d.UploadedAt })
                .ToListAsync();

            // Check if there is payment processing for this stage / application
            var payment = await _context.Payments
                .Where(p => p.ApplicationId == task.ApplicationId)
                .OrderByDescending(p => p.Id)
                .FirstOrDefaultAsync();

            decimal stageFeeAmount = 0m;
            bool stageHasPaymentField = false;
            if (submission != null)
            {
                var template = await _context.Templates
                    .Include(t => t.Fields)
                    .FirstOrDefaultAsync(t => t.ServiceProcedureId == submission.ServiceProcedureId && t.StageOrder == task.StageNumber && t.Status == "Active");
                var paymentField = template?.Fields.FirstOrDefault(f => f.Type == "payment");
                if (paymentField != null)
                {
                    stageHasPaymentField = true;
                    if (!string.IsNullOrWhiteSpace(paymentField.Options))
                    {
                        try
                        {
                            using var pDoc = JsonDocument.Parse(paymentField.Options);
                            if (pDoc.RootElement.TryGetProperty("amount", out var a)) stageFeeAmount = a.GetDecimal();
                        }
                        catch { }
                    }
                }
            }

            object? paymentInfo = null;
            if (stageHasPaymentField && stageFeeAmount > 0)
            {
                if (payment != null)
                {
                    paymentInfo = new
                    {
                        id = payment.Id,
                        hasPayment = true,
                        amount = payment.Amount,
                        status = payment.Status, // "Paid", "PendingVerification", "Pending", "Failed"
                        isVerified = payment.Status == "Paid",
                        method = payment.Method,
                        slipUrl = payment.ManualSlipUrl,
                        paidDate = payment.PaidDate
                    };
                }
                else
                {
                    paymentInfo = new
                    {
                        id = (int?)null,
                        hasPayment = true,
                        amount = stageFeeAmount,
                        status = "Pending",
                        isVerified = false,
                        method = "Unpaid",
                        slipUrl = (string?)null,
                        paidDate = (DateTime?)null
                    };
                }
            }
            else if (submission != null && submission.MaxStages <= 1 && payment != null)
            {
                paymentInfo = new
                {
                    id = payment.Id,
                    hasPayment = true,
                    amount = payment.Amount,
                    status = payment.Status,
                    isVerified = payment.Status == "Paid",
                    method = payment.Method,
                    slipUrl = payment.ManualSlipUrl,
                    paidDate = payment.PaidDate
                };
            }

            return Ok(new
            {
                task = summary,
                submittedAt = submission?.SubmittedAt,
                userEmail = submission?.UserEmail,
                answers,
                documents,
                payment = paymentInfo
            });
        }

        // The file a citizen uploaded, streamed with its detected content type for in-browser preview.
        [Authorize(Roles = OfficerRoles)]
        [HttpGet("documents/{documentId:guid}/content")]
        public async Task<IActionResult> GetDocumentContent(Guid documentId)
        {
            var document = await _context.SubmissionDocuments
                .FirstOrDefaultAsync(d => d.Id == documentId && d.ApplicationId != null);
            if (document == null) return NotFound("Document not found.");

            // No file name here so the browser shows it inline instead of downloading it
            Response.Headers["X-Content-Type-Options"] = "nosniff";
            return File(document.Content, document.ContentType);
        }

        // Agent 3 (Action/Tool Agent) draft for the task's application: pre-filled fields, fee,
        // proposed appointment, plus Agent 2's eligibility result. 404 until it has been generated.
        [Authorize(Roles = OfficerRoles)]
        [HttpGet("tasks/{id:int}/agent-draft")]
        public async Task<IActionResult> GetAgentDraft(int id)
        {
            var task = await _context.VerificationTasks.FindAsync(id);
            if (task == null) return NotFound("Task not found.");

            var draft = await _draftingService.GetStoredDraftAsync(task.ApplicationId);
            return draft == null ? NotFound("No agent draft yet.") : Ok(draft);
        }

        // Runs Agent 2 then Agent 3 on the submitted application and stores the result.
        [Authorize(Roles = OfficerRoles)]
        [HttpPost("tasks/{id:int}/agent-draft")]
        public async Task<IActionResult> GenerateAgentDraft(int id)
        {
            var task = await _context.VerificationTasks.FindAsync(id);
            if (task == null) return NotFound("Task not found.");

            try
            {
                var draft = await _draftingService.GenerateDraftAsync(task.ApplicationId);
                return draft == null
                    ? NotFound("No submitted application is linked to this task.")
                    : Ok(draft);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Agent draft generation failed", details = ex.Message });
            }
        }

        [Authorize(Roles = OfficerRoles)]
        [HttpGet("stats")]
        public async Task<IActionResult> GetOfficerStats()
        {
            var stats = await _verificationService.GetOfficerStatsAsync(GetCurrentOfficerId());
            return Ok(stats);
        }

        [Authorize(Roles = OfficerRoles)]
        [HttpPost("tasks")]
        public async Task<IActionResult> CreateVerificationTask([FromBody] CreateTaskRequest request)
        {
            var task = await _verificationService.CreateTaskAsync(request, GetCurrentOfficerId());
            return Ok(task);
        }

        [Authorize(Roles = OfficerRoles)]
        [HttpGet("audit-logs")]
        public async Task<IActionResult> GetAuditLogs([FromQuery] int applicationId)
        {
            var logs = await _verificationService.GetAuditLogsAsync(applicationId);
            return Ok(logs);
        }

        [Authorize(Roles = OfficerRoles)]
        [HttpGet("audit-logs/all")]
        public async Task<IActionResult> GetAllAuditLogs()
        {
            var logs = await _verificationService.GetAllAuditLogsAsync();
            return Ok(logs);
        }

        [Authorize(Roles = OfficerRoles)]
        [HttpPut("tasks/{id}/decision")]
        public async Task<IActionResult> RecordDecision(int id, [FromBody] VerificationDecisionRequest request)
        {
            var task = await _context.VerificationTasks.FindAsync(id);
            if (task == null) return NotFound("Task not found or update failed");

            // Guard: If approving, ensure statutory fee for this stage is verified by Finance!
            if (string.Equals(request.Status, "Approved", StringComparison.OrdinalIgnoreCase))
            {
                var submission = await _context.ApplicationSubmissions.FindAsync(task.ApplicationId);
                if (submission != null)
                {
                    var currentStageNum = task.StageNumber > 0 ? task.StageNumber : task.CurrentStage;
                    var template = await _context.Templates
                        .Include(t => t.Fields)
                        .FirstOrDefaultAsync(t => t.ServiceProcedureId == submission.ServiceProcedureId 
                                               && t.StageOrder == currentStageNum 
                                               && t.Status == "Active");
                    var paymentField = template?.Fields.FirstOrDefault(f => f.Type == "payment");
                    if (paymentField != null)
                    {
                        var payment = await _context.Payments
                            .Where(p => p.ApplicationId == task.ApplicationId)
                            .OrderByDescending(p => p.Id)
                            .FirstOrDefaultAsync();

                        if (payment == null || payment.Status != "Paid")
                        {
                            return BadRequest(new 
                            { 
                                message = $"Cannot complete Stage {currentStageNum} as verified: Statutory payment has not been verified by the Department Finance Officer." 
                            });
                        }
                    }
                }
            }

            var result = await _verificationService.RecordDecisionAsync(id, request, GetCurrentOfficerId());

            if (!result) return NotFound("Task not found or update failed");

            // Synchronize the citizen application status
            var sub = await _context.ApplicationSubmissions.FindAsync(task.ApplicationId);
            if (sub != null)
            {
                if (string.Equals(request.Status, "Suspended", StringComparison.OrdinalIgnoreCase))
                {
                    sub.StageStatus = "ActionRequired";
                }
                else if (string.Equals(request.Status, "Rejected", StringComparison.OrdinalIgnoreCase))
                {
                    sub.StageStatus = "ActionRequired";
                }
                else if (string.Equals(request.Status, "Approved", StringComparison.OrdinalIgnoreCase))
                {
                    sub.StageStatus = (task.CurrentStage < task.MaxStages) ? "StageApproved" : "Completed";
                }
                await _context.SaveChangesAsync();
            }

            return Ok();
        }

        public class DeleteApplicationRequest
        {
            public string? Reason { get; set; }
        }

        [Authorize(Roles = OfficerRoles)]
        [HttpDelete("tasks/{id}")]
        public async Task<IActionResult> DeleteTask(int id, [FromQuery] string? reason = null)
        {
            var result = await _verificationService.DeleteTaskAsync(id, GetCurrentOfficerId(), reason);

            if (!result) return NotFound(new { success = false, message = $"Verification task {id} not found." });
            return Ok(new { success = true, message = "Application deleted from verification queue and recorded in audit log." });
        }

        [Authorize(Roles = OfficerRoles)]
        [HttpPost("tasks/{id}/delete")]
        public async Task<IActionResult> DeleteTaskPost(int id, [FromBody] DeleteApplicationRequest? request = null, [FromQuery] string? reason = null)
        {
            var effectiveReason = request?.Reason ?? reason;
            var result = await _verificationService.DeleteTaskAsync(id, GetCurrentOfficerId(), effectiveReason);

            if (!result) return NotFound(new { success = false, message = $"Verification task {id} not found." });
            return Ok(new { success = true, message = "Application deleted from verification queue and recorded in audit log." });
        }

        [Authorize(Roles = OfficerRoles)]
        [HttpDelete("applications/{applicationId}")]
        public async Task<IActionResult> DeleteApplication(int applicationId, [FromQuery] string? reason = null, [FromBody] DeleteApplicationRequest? request = null)
        {
            var officerId = GetCurrentOfficerId();
            var effectiveReason = request?.Reason ?? reason;
            var task = await _context.VerificationTasks.FirstOrDefaultAsync(t => t.ApplicationId == applicationId);
            if (task != null)
            {
                var result = await _verificationService.DeleteTaskAsync(task.Id, officerId, effectiveReason);
                if (!result) return NotFound(new { success = false, message = $"Application {applicationId} not found." });
                return Ok(new { success = true, message = $"Application {applicationId} deleted and audit logged." });
            }

            var submission = await _context.ApplicationSubmissions
                .Include(s => s.ServiceProcedure)
                .FirstOrDefaultAsync(s => s.Id == applicationId);
            if (submission == null) return NotFound(new { success = false, message = $"Application {applicationId} not found." });

            submission.StageStatus = "Deleted";
            var serviceName = submission.ServiceProcedure?.Name ?? "General Service";
            _context.AuditLogs.Add(new AuditLog
            {
                ApplicationId = applicationId,
                Action = "Application Deleted",
                PerformedBy = officerId,
                Timestamp = DateTime.UtcNow,
                OldValues = $"Citizen: {submission.CitizenNic}, Service: {serviceName}, Stage: {submission.CurrentStage}, PreviousStatus: {submission.StageStatus}",
                NewValues = $"Deleted by verifying officer {officerId}. Reason: {effectiveReason ?? "Application not required for review"}"
            });
            await _context.SaveChangesAsync();
            return Ok(new { success = true, message = $"Application {applicationId} deleted and audit logged." });
        }

        [Authorize(Roles = OfficerRoles)]
        [HttpPost("tasks/bulk-verify")]
        public async Task<IActionResult> BulkVerify([FromBody] BulkVerifyRequest request)
        {
            var result = await _verificationService.BulkVerifyAsync(request, GetCurrentOfficerId());

            if (!result) return BadRequest("Bulk verification failed");
            return Ok();
        }
        [Authorize(Roles = OfficerRoles)]
        [HttpGet("rejection-reasons")]
        public async Task<IActionResult> GetRejectionReasons()
        {
            var reasons = await _verificationService.GetRejectionReasonsAsync();
            return Ok(reasons);
        }

        [Authorize(Roles = OfficerRoles)]
        [HttpPost("rejection-reasons")]
        public async Task<IActionResult> CreateRejectionReason([FromBody] Government_Service_Navigator.Backend.Models.Entities.RejectionReason reason)
        {
            var created = await _verificationService.CreateRejectionReasonAsync(reason);
            return Ok(created);
        }

        [Authorize(Roles = OfficerRoles)]
        [HttpPut("rejection-reasons/{id}")]
        public async Task<IActionResult> UpdateRejectionReason(int id, [FromBody] Government_Service_Navigator.Backend.Models.Entities.RejectionReason reason)
        {
            var success = await _verificationService.UpdateRejectionReasonAsync(id, reason);
            if (!success) return NotFound();
            return Ok();
        }

        [Authorize(Roles = OfficerRoles)]
        [HttpPut("tasks/{id}/approve-stage")]
        public async Task<IActionResult> ApproveStage(int id, [FromBody] ApproveStageRequest request)
        {
            var task = await _context.VerificationTasks.FindAsync(id);
            if (task == null) return NotFound("Task not found.");

            var submission = await _context.ApplicationSubmissions.FindAsync(task.ApplicationId);
            if (submission == null) return NotFound("Submission not found.");

            // Guard: Ensure statutory fee for THIS stage is verified by Finance Officer!
            var currentStageNum = task.StageNumber > 0 ? task.StageNumber : task.CurrentStage;
            var template = await _context.Templates
                .Include(t => t.Fields)
                .FirstOrDefaultAsync(t => t.ServiceProcedureId == submission.ServiceProcedureId 
                                       && t.StageOrder == currentStageNum 
                                       && t.Status == "Active");
            var paymentField = template?.Fields.FirstOrDefault(f => f.Type == "payment");
            if (paymentField != null)
            {
                var payment = await _context.Payments
                    .Where(p => p.ApplicationId == task.ApplicationId)
                    .OrderByDescending(p => p.Id)
                    .FirstOrDefaultAsync();

                if (payment == null || payment.Status != "Paid")
                {
                    return BadRequest(new 
                    { 
                        message = $"Cannot approve Stage {currentStageNum} milestone: Statutory fee payment has not been verified by the Department Finance Officer." 
                    });
                }
            }

            var officerId = GetCurrentOfficerId();

            var prevStage = task.StageNumber > 0 ? task.StageNumber : task.CurrentStage;
            var prevDept = task.Department ?? submission.CurrentDepartment ?? "Verifying Department";

            // 1. Mark THIS stage verification task as APPROVED and record official officer review
            task.Status = "Approved";
            task.StageNumber = prevStage;
            task.Department = prevDept;

            _context.OfficerReviews.Add(new OfficerReview
            {
                TaskId = task.Id,
                OfficerId = officerId,
                ReviewDate = DateTime.UtcNow,
                Comments = !string.IsNullOrWhiteSpace(request.Notes) 
                    ? request.Notes 
                    : $"Stage {prevStage} verified and approved by {prevDept}"
            });

            // 2. Advance the citizen submission to the next stage
            if (prevStage < task.MaxStages)
            {
                var nextStage = prevStage + 1;
                submission.CurrentStage = nextStage;

                // Look for the template assigned to the next stage
                var nextTemplate = await _context.Templates
                    .Where(t => t.ServiceProcedureId == submission.ServiceProcedureId && t.StageOrder == nextStage && t.Status == "Active")
                    .FirstOrDefaultAsync();

                if (nextTemplate != null)
                {
                    submission.CurrentDepartment = nextTemplate.Department;
                    submission.StageStatus = "StageApproved";
                }
                else
                {
                    submission.StageStatus = "AwaitingFeePayment"; // Unlocks fee payment milestone for the citizen!
                }
            }
            else
            {
                // All stages finished
                submission.CurrentStage = task.MaxStages;
                submission.StageStatus = "Completed";
            }

            // 3. Audit log the milestone approval
            _context.AuditLogs.Add(new AuditLog
            {
                ApplicationId = submission.Id,
                Action = $"Stage {prevStage} Milestone Approved by {prevDept}",
                PerformedBy = officerId,
                Timestamp = DateTime.UtcNow,
                OldValues = $"Stage: {prevStage}, Dept: {prevDept}, Status: Pending",
                NewValues = $"Stage: {submission.CurrentStage}, Status: Approved, NextDept: {submission.CurrentDepartment}, Note: {request.Notes}"
            });

            // 3. Trigger citizen notification
            var notificationService = HttpContext.RequestServices.GetService<INotificationService>();
            if (notificationService != null && !string.IsNullOrEmpty(submission.UserEmail))
            {
                var nextNotice = !string.IsNullOrEmpty(submission.CurrentDepartment)
                    ? $"Please open the app to submit the Stage {task.CurrentStage} form for {submission.CurrentDepartment}."
                    : $"Please open the app to complete Stage {task.CurrentStage}.";

                await notificationService.SendEmailAsync(
                    submission.UserEmail,
                    $"Stage {prevStage} Approved by {prevDept}!",
                    $"Your Stage {prevStage} application has been verified and approved by {prevDept}. {nextNotice}"
                );
            }

            await _context.SaveChangesAsync();
            return Ok(new { currentStage = task.CurrentStage, maxStages = task.MaxStages, status = task.Status, currentDepartment = submission.CurrentDepartment });
        }

        public class ApproveStageRequest
        {
            public string? Notes { get; set; }
        }


        [Authorize(Roles = OfficerRoles)]
        [HttpDelete("rejection-reasons/{id}")]
        public async Task<IActionResult> DeleteRejectionReason(int id)
        {
            var success = await _verificationService.DeleteRejectionReasonAsync(id);
            if (!success) return NotFound();
            return NoContent();
        }
        [AllowAnonymous]
        [HttpGet("seed")]
        public async Task<IActionResult> SeedTasks()
        {
            var db = HttpContext.RequestServices.GetRequiredService<Government_Service_Navigator.Backend.Data.Context.AppDbContext>();
            var random = new Random();
            for (int i = 0; i < 5; i++)
            {
                db.VerificationTasks.Add(new Government_Service_Navigator.Backend.Models.Entities.VerificationTask
                {
                    ApplicationId = random.Next(1000, 9999),
                    Status = "Pending",
                    CreatedDate = DateTime.UtcNow.AddHours(-random.Next(1, 48))
                });
            }
            await db.SaveChangesAsync();
            return Ok("5 new Pending tasks seeded! Go back to Pending Reviews page and refresh.");
        }
    }
}
