using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;
using Government_Service_Navigator.Backend.Data.Context;
using Government_Service_Navigator.Backend.DTOs.Requests;
using Government_Service_Navigator.Backend.DTOs.Responses;
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
        private readonly ICitizenApplicationsService _citizenApplications;

        public VerificationController(
            IVerificationService verificationService,
            AppDbContext context,
            IApplicationDraftingService draftingService,
            ICitizenApplicationsService citizenApplications)
        {
            _verificationService = verificationService;
            _context = context;
            _draftingService = draftingService;
            _citizenApplications = citizenApplications;
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
                    s.CurrentDepartment,
                    s.CurrentStage,
                    s.MaxStages,
                    s.StageStatus
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
                .AsNoTracking()
                .Where(r => taskIds.Contains(r.TaskId))
                .OrderByDescending(r => r.ReviewDate)
                .ToListAsync();
            var reviewByTask = reviews.GroupBy(r => r.TaskId).ToDictionary(g => g.Key, g => g.First());

            return tasks.Select(t =>
            {
                submissions.TryGetValue(t.ApplicationId, out var s);
                var nic = s?.CitizenNic ?? t.CitizenNic;
                reviewByTask.TryGetValue(t.Id, out var rev);

                int effectiveMaxStages = s?.MaxStages > 0 ? s.MaxStages : (t.MaxStages > 0 ? t.MaxStages : 1);
                int effectiveStage = t.StageNumber > 0 
                    ? t.StageNumber 
                    : (s?.CurrentStage > 0 ? s.CurrentStage : (t.CurrentStage > 0 ? t.CurrentStage : 1));

                string effectiveStatus = t.Status;
                if (effectiveStatus == "Pending" && s?.StageStatus == "Completed")
                {
                    effectiveStatus = "Approved";
                }

                return (object)new
                {
                    t.Id,
                    t.ApplicationId,
                    Status = effectiveStatus,
                    t.CreatedDate,
                    VerifiedDate = rev?.ReviewDate ?? t.CreatedDate,
                    CurrentStage = effectiveStage,
                    MaxStages = effectiveMaxStages,
                    Department = t.Department ?? s?.CurrentDepartment,
                    StageNumber = effectiveStage,
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
        public async Task<IActionResult> GetMyApplications(CancellationToken cancellationToken)
        {
            var nic = User.FindFirstValue("nicNumber") ?? User.FindFirst("nic")?.Value;
            if (string.IsNullOrWhiteSpace(nic)) return Ok(Array.Empty<object>());

            return Ok(await _citizenApplications.GetMyApplicationsAsync(Validation.SriLankaNic.Normalize(nic), cancellationToken));
        }

        // Department the caller's queue is limited to; null for system admins and unscoped staff
        private string? GetDepartmentScope()
        {
            var role = User.FindFirstValue(ClaimTypes.Role) ?? string.Empty;
            var dept = User.FindFirstValue("department") ?? User.FindFirst("department")?.Value;
            var isSystemAdmin = role.Contains("System Admin", StringComparison.OrdinalIgnoreCase) || role == "Admin";
            return isSystemAdmin || string.IsNullOrEmpty(dept) ? null : dept;
        }

        // With ?page= the response is a PagedResult; without it, a plain array of the newest
        // Paging.UnpagedLimit rows (the shape older clients expect).
        [Authorize(Roles = OfficerRoles)]
        [HttpGet("tasks/pending")]
        public async Task<IActionResult> GetPendingTasks([FromQuery] int? page, [FromQuery] int pageSize = 25, [FromQuery] string? search = null)
        {
            var result = await _verificationService.GetPendingTasksAsync(GetDepartmentScope(), page, pageSize, search);
            return await TaskListResponseAsync(result, page);
        }

        [Authorize(Roles = OfficerRoles)]
        [HttpGet("tasks/verified")]
        public async Task<IActionResult> GetVerifiedTasks([FromQuery] int? page, [FromQuery] int pageSize = 25, [FromQuery] string? search = null, [FromQuery] string? status = null)
        {
            var result = await _verificationService.GetVerifiedTasksAsync(GetDepartmentScope(), page, pageSize, search, status);
            return await TaskListResponseAsync(result, page);
        }

        // Counts for the dashboard cards (pending, approved, rejected, suspended)
        [Authorize(Roles = OfficerRoles)]
        [HttpGet("tasks/summary")]
        public async Task<IActionResult> GetTaskSummary()
        {
            return Ok(await _verificationService.GetTaskSummaryAsync(GetDepartmentScope()));
        }

        private async Task<IActionResult> TaskListResponseAsync(PagedResult<VerificationTask> result, int? page)
        {
            var rows = await WithApplicationDetailsAsync(result.Items);
            if (page == null) return Ok(rows);
            return Ok(new PagedResult<object> { Items = rows, Total = result.Total, Page = result.Page, PageSize = result.PageSize });
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

            // Fetch all documents for this application (VO can see everything — swipe gallery).
            // Each doc is tagged with a category so the UI knows which ones are stage-specific.
            // Note: in-memory filtering used because EF/Npgsql cannot translate StringComparison to SQL.
            var allDocuments = await _context.SubmissionDocuments
                .Where(d => d.ApplicationId == task.ApplicationId)
                .OrderBy(d => d.UploadedAt)
                .Select(d => new { d.Id, d.FieldLabel, d.FileName, d.ContentType, d.SizeBytes, d.UploadedAt })
                .ToListAsync();

            // Check if there is payment processing for this stage / application
            var payment = await _context.Payments
                .Where(p => p.ApplicationId == task.ApplicationId)
                .OrderByDescending(p => p.Id)
                .FirstOrDefaultAsync();

            // Load active template for the current stage to inspect required file & payment fields
            string[] paymentKeywords = ["bank slip", "deposit slip", "payment slip", "transfer slip", "bank deposit", "bank transfer", "remittance slip", "challan"];
            HashSet<string> stageFileLabels = new(StringComparer.OrdinalIgnoreCase);
            HashSet<string> stagePaymentLabels = new(StringComparer.OrdinalIgnoreCase);
            decimal stageFeeAmount = 0m;
            bool stageHasPaymentField = false;

            int activeReviewStage = submission?.CurrentStage > 0
                ? submission.CurrentStage
                : (task.CurrentStage > 0 ? task.CurrentStage : (task.StageNumber > 0 ? task.StageNumber : 1));

            if (submission != null)
            {
                var stageTemplate = await _context.Templates
                    .Include(t => t.Fields)
                    .Where(t => t.ServiceProcedureId == submission.ServiceProcedureId
                                && t.StageOrder == activeReviewStage)
                    .OrderByDescending(t => t.Status == "Active" ? 1 : 0)
                    .ThenByDescending(t => t.CreatedAt)
                    .FirstOrDefaultAsync();

                if (stageTemplate != null)
                {
                    foreach (var f in stageTemplate.Fields)
                    {
                        var clean = f.Label.Trim().TrimEnd(':');
                        if (string.Equals(f.Type, "payment", StringComparison.OrdinalIgnoreCase))
                        {
                            stageHasPaymentField = true;
                            stagePaymentLabels.Add(clean);
                            if (!string.IsNullOrWhiteSpace(f.Options))
                            {
                                try
                                {
                                    using var pDoc = JsonDocument.Parse(f.Options);
                                    if (pDoc.RootElement.TryGetProperty("amount", out var a)) stageFeeAmount = a.GetDecimal();
                                    if (pDoc.RootElement.TryGetProperty("feeType", out var ft) && !string.IsNullOrWhiteSpace(ft.GetString()))
                                        stagePaymentLabels.Add(ft.GetString()!.Trim().TrimEnd(':'));
                                }
                                catch { }
                            }
                        }
                        else if (string.Equals(f.Type, "file", StringComparison.OrdinalIgnoreCase)
                                 || string.Equals(f.Type, "document", StringComparison.OrdinalIgnoreCase)
                                 || string.Equals(f.Type, "documentUpload", StringComparison.OrdinalIgnoreCase))
                        {
                            // Only file/document fields configured on this stage template (required or optional) are stage documents
                            stageFileLabels.Add(clean);
                        }
                    }
                }
            }

            static string NormalizeDocLabel(string val) =>
                new string(val.Where(char.IsLetterOrDigit).ToArray()).ToLowerInvariant();

            // Tag each document: "stage" | "payment" | "other"
            var documents = allDocuments.Select(d =>
            {
                string category;
                var label = d.FieldLabel?.Trim().TrimEnd(':') ?? "";
                var normLabel = NormalizeDocLabel(label);

                // 1. Stage document check:
                // Only matches if it corresponds to an evidentiary file field configured on THIS current stage template.
                bool isStageDoc = !string.IsNullOrEmpty(normLabel) && stageFileLabels.Any(s =>
                    string.Equals(NormalizeDocLabel(s), normLabel, StringComparison.OrdinalIgnoreCase)
                );

                if (!isStageDoc && stageFileLabels.Count == 0 && (submission?.MaxStages <= 1))
                {
                    isStageDoc = true;
                }

                // 2. Payment slip check:
                // Only consider as payment slip if this current stage actually requires a statutory payment,
                // and it matches the specific slip the citizen uploaded for payment (or the stage payment field label).
                bool isPaymentSlip = false;
                if (!isStageDoc && stageHasPaymentField && stageFeeAmount > 0)
                {
                    isPaymentSlip = (payment != null && !string.IsNullOrEmpty(payment.ManualSlipUrl) && payment.ManualSlipUrl.Contains(d.Id.ToString(), StringComparison.OrdinalIgnoreCase))
                        || (!string.IsNullOrEmpty(normLabel) && stagePaymentLabels.Any(pl => string.Equals(NormalizeDocLabel(pl), normLabel, StringComparison.OrdinalIgnoreCase)));
                }

                if (isStageDoc)
                {
                    category = "stage";
                }
                else if (isPaymentSlip)
                {
                    category = "payment";
                }
                else
                {
                    category = "other";
                }

                return new { d.Id, d.FieldLabel, d.FileName, d.ContentType, d.SizeBytes, d.UploadedAt, category };
            }).ToList();

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
                        id = 0,
                        hasPayment = true,
                        amount = stageFeeAmount,
                        status = "Pending",
                        isVerified = false,
                        method = "Pending",
                        slipUrl = (string?)null,
                        paidDate = (DateTime?)null
                    };
                }
            }
            else if ((submission?.MaxStages <= 1) && payment != null)
            {
                // Template fee could not be read (single-stage) but a real payment record exists
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
            else
            {
                // Stage does not require a fee payment
                paymentInfo = new
                {
                    id = 0,
                    hasPayment = false,
                    amount = 0m,
                    status = "None",
                    isVerified = true,
                    method = (string?)null,
                    slipUrl = (string?)null,
                    paidDate = (DateTime?)null
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

        // Newest first. ?page= returns a PagedResult; without it, the newest Paging.UnpagedLimit rows.
        // applicationIds (comma separated) limits the logs to those applications.
        [Authorize(Roles = OfficerRoles)]
        [HttpGet("audit-logs/all")]
        public async Task<IActionResult> GetAllAuditLogs(
            [FromQuery] int? page,
            [FromQuery] int pageSize = 25,
            [FromQuery] string? search = null,
            [FromQuery] string? action = null,
            [FromQuery] string? applicationIds = null)
        {
            var filter = new AuditLogQuery
            {
                Search = search,
                Action = action,
                ApplicationIds = applicationIds?
                    .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                    .Select(id => int.TryParse(id, out var n) ? n : 0)
                    .Where(n => n > 0)
                    .Take(Paging.MaxPageSize)
                    .ToList()
            };
            var result = await _verificationService.GetAllAuditLogsAsync(filter, page, pageSize);
            return page == null ? Ok(result.Items) : Ok(result);
        }

        [Authorize(Roles = OfficerRoles)]
        [HttpGet("audit-logs/summary")]
        public async Task<IActionResult> GetAuditLogSummary()
        {
            return Ok(await _verificationService.GetAuditLogSummaryAsync());
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

            // Synchronize the citizen application status & verification task
            var sub = await _context.ApplicationSubmissions.FindAsync(task.ApplicationId);
            if (sub != null)
            {
                if (string.Equals(request.Status, "Suspended", StringComparison.OrdinalIgnoreCase))
                {
                    sub.StageStatus = "ActionRequired";
                    task.Status = "Suspended";
                }
                else if (string.Equals(request.Status, "Rejected", StringComparison.OrdinalIgnoreCase))
                {
                    sub.StageStatus = "ActionRequired";
                    task.Status = "Rejected";
                }
                else if (string.Equals(request.Status, "Revised", StringComparison.OrdinalIgnoreCase) ||
                         string.Equals(request.Status, "Revision Requested", StringComparison.OrdinalIgnoreCase))
                {
                    sub.StageStatus = "ActionRequired";
                    task.Status = "Revised";
                }
                else if (string.Equals(request.Status, "Approved", StringComparison.OrdinalIgnoreCase))
                {
                    int currentStage = sub.CurrentStage > 0 ? sub.CurrentStage : (task.CurrentStage > 0 ? task.CurrentStage : 1);
                    int maxStages = sub.MaxStages > 0 ? sub.MaxStages : (task.MaxStages > 0 ? task.MaxStages : 1);
                    task.Status = "Approved";

                    if (currentStage >= maxStages)
                    {
                        sub.CurrentStage = maxStages;
                        sub.StageStatus = "Completed";
                        task.CurrentStage = maxStages;
                        task.StageNumber = maxStages;
                    }
                    else
                    {
                        sub.StageStatus = "StageApproved";
                    }
                }
                await _context.SaveChangesAsync();
            }

            return Ok();
        }

        // The endpoints bind the entity directly, so the rules live here rather than as annotations
        private static List<string> RejectionReasonProblems(Government_Service_Navigator.Backend.Models.Entities.RejectionReason? reason)
        {
            var problems = new List<string>();
            if (reason == null) { problems.Add("Rejection code details are required."); return problems; }
            if (string.IsNullOrWhiteSpace(reason.Code)
                || !System.Text.RegularExpressions.Regex.IsMatch(reason.Code.Trim(), @"^[A-Za-z0-9][A-Za-z0-9\-]{1,19}$"))
                problems.Add("Code must be 2-20 letters, numbers or dashes, e.g. ERR-101.");
            if (string.IsNullOrWhiteSpace(reason.Description) || reason.Description.Trim().Length is < 3 or > 300)
                problems.Add("Description must be 3-300 characters.");
            return problems;
        }

        public class DeleteApplicationRequest
        {
            [System.ComponentModel.DataAnnotations.MaxLength(1000, ErrorMessage = "Reason must be at most 1000 characters.")]
            [Government_Service_Navigator.Backend.Validation.PlainText]
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
            var problems = RejectionReasonProblems(reason);
            if (problems.Count > 0) return BadRequest(Government_Service_Navigator.Backend.Validation.ValidationError.Body(problems));

            var created = await _verificationService.CreateRejectionReasonAsync(reason);
            return Ok(created);
        }

        [Authorize(Roles = OfficerRoles)]
        [HttpPut("rejection-reasons/{id}")]
        public async Task<IActionResult> UpdateRejectionReason(int id, [FromBody] Government_Service_Navigator.Backend.Models.Entities.RejectionReason reason)
        {
            var problems = RejectionReasonProblems(reason);
            if (problems.Count > 0) return BadRequest(Government_Service_Navigator.Backend.Validation.ValidationError.Body(problems));

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

            var prevStage = task.StageNumber > 0 ? task.StageNumber : (submission.CurrentStage > 0 ? submission.CurrentStage : task.CurrentStage);
            var maxStages = task.MaxStages > 0 ? task.MaxStages : (submission.MaxStages > 0 ? submission.MaxStages : 1);
            var prevDept = task.Department ?? submission.CurrentDepartment ?? "Verifying Department";

            // 1. Mark THIS stage verification task as APPROVED and record official officer review
            task.Status = "Approved";
            task.StageNumber = prevStage;
            task.CurrentStage = prevStage;
            task.MaxStages = maxStages;
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

            // 2. Advance the citizen submission to the next stage or complete
            if (prevStage < maxStages)
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
                submission.CurrentStage = maxStages;
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
            [System.ComponentModel.DataAnnotations.MaxLength(2000, ErrorMessage = "Notes must be at most 2000 characters.")]
            [Government_Service_Navigator.Backend.Validation.PlainText]
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
