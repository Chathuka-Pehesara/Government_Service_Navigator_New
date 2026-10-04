using Government_Service_Navigator.AgenticAi.Tools.CalculateFee;
using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Government_Service_Navigator.Backend.Data.Context;
using Government_Service_Navigator.Backend.DTOs.Requests;
using Government_Service_Navigator.Backend.Models.Entities;
using Government_Service_Navigator.Backend.Services;
using Government_Service_Navigator.Backend.Services.Interfaces;
using Government_Service_Navigator.Backend.Validation;
using Government_Service_Navigator.AgenticAi.Agents.ValidationSafety;
using Government_Service_Navigator.AgenticAi.Schemas;
using Government_Service_Navigator.AgenticAi.Tools.CheckDuplicateApplication;

namespace Government_Service_Navigator.Backend.Controllers
{
    // Citizen-facing application intake: fetch a service's form, submit it, and (for paid services) finalize after payment.
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class ApplicationsController : ControllerBase
    {
        // Layout-only template elements that never carry an answer.
        private static readonly string[] DisplayOnlyTypes = { "heading", "paragraph" };

        // Service Catalog category -> department; mirrors web/src/constants/departments.ts.
        private static readonly Dictionary<string, string> DepartmentByCategory = new(StringComparer.OrdinalIgnoreCase)
        {
            // Common Thematic Categories
            ["Personal & Family"] = "Department of Registration of Persons",
            ["Transport & Travel"] = "Department of Motor Traffic",
            ["Legal & Security"] = "Police Department",
            ["Business & Trade"] = "Divisional Secretariat",
            ["Public & Community Services"] = "Divisional Secretariat",
            ["General"] = "Divisional Secretariat",

            // Legacy mappings (for backward compatibility)
            ["Immigration"] = "Department of Immigration & Emigration",
            ["Transport"] = "Department of Motor Traffic",
            ["Police"] = "Police Department",
            ["Civil"] = "Department of Registration of Persons",
            ["Public Administration"] = "Divisional Secretariat",
            ["Commerce"] = "Divisional Secretariat",
        };

        private const string PresentedByKey = "Presented by";
        private const string EmailKey = "Email";

        private readonly AppDbContext _context;
        private readonly IVerificationService _verificationService;
        private readonly ICalculateFeeTool _feeTool;
        private readonly IValidationSafetyAgent _safetyAgent;
        private readonly IDuplicateCheckTool _duplicateTool;

        public ApplicationsController(AppDbContext context, IVerificationService verificationService, ICalculateFeeTool feeTool, IValidationSafetyAgent safetyAgent, IDuplicateCheckTool duplicateTool)
        {
            _context = context;
            _verificationService = verificationService;
            _feeTool = feeTool;
            _safetyAgent = safetyAgent;
            _duplicateTool = duplicateTool;
        }

        // Active application template linked to the service, or 404 if the admin hasn't built one.
        [HttpGet("form/{serviceProcedureId:int}")]
        public async Task<IActionResult> GetForm(int serviceProcedureId, [FromQuery] int stage = 1)
        {
            var query = _context.Templates
                .Include(t => t.Fields.OrderBy(f => f.OrderIndex))
                .Where(t => t.ServiceProcedureId == serviceProcedureId && t.Status == "Active");

            var template = await query
                .Where(t => t.StageOrder == stage)
                .OrderByDescending(t => t.CreatedAt)
                .FirstOrDefaultAsync()
                ?? await query.OrderBy(t => t.StageOrder).FirstOrDefaultAsync();

            if (template == null) return NotFound("No application form is available for this service yet.");

            var service = await _context.ServiceProcedures.FindAsync(serviceProcedureId);
            var deptName = !string.IsNullOrEmpty(template.Department) ? template.Department : null;
            var (resolvedDept, email) = await ResolveDepartmentAsync(deptName ?? service?.Category);
            var targetDeptName = deptName ?? resolvedDept;

            var deptEntity = await _context.Departments
                .FirstOrDefaultAsync(d => EF.Functions.ILike(d.Name, targetDeptName)
                                       || EF.Functions.ILike(d.DepartmentCode, targetDeptName)
                                       || (d.Category != null && service != null && EF.Functions.ILike(d.Category, service.Category)));

            List<string> workflowDepts = new();
            if (!string.IsNullOrEmpty(service?.WorkflowDepartments))
            {
                try { workflowDepts = JsonSerializer.Deserialize<List<string>>(service!.WorkflowDepartments) ?? new(); }
                catch { }
            }

            return Ok(new
            {
                template,
                stage = template.StageOrder,
                totalStages = service?.TotalStages ?? 1,
                workflowDepartments = workflowDepts,
                department = new
                {
                    id = deptEntity?.Id,
                    name = deptEntity?.Name ?? targetDeptName,
                    departmentCode = deptEntity?.DepartmentCode ?? "GSN",
                    logoUrl = deptEntity?.LogoUrl,
                    contactNumber = deptEntity?.ContactNumber,
                    email = !string.IsNullOrEmpty(deptEntity?.Email) ? deptEntity.Email : email,
                    address = deptEntity?.Address,
                    website = deptEntity?.Website,
                    category = deptEntity?.Category ?? service?.Category
                }
            });
        }

        // Returns all configured workflow stages and application forms for a service
        [HttpGet("stages/{serviceProcedureId:int}")]
        public async Task<IActionResult> GetStages(int serviceProcedureId)
        {
            var service = await _context.ServiceProcedures.FindAsync(serviceProcedureId);
            if (service == null) return NotFound("Service not found.");

            var templates = await _context.Templates
                .Where(t => t.ServiceProcedureId == serviceProcedureId && t.Status == "Active")
                .OrderBy(t => t.StageOrder)
                .Select(t => new
                {
                    t.Id,
                    t.FormName,
                    t.SubTitle,
                    t.Department,
                    t.StageOrder,
                    t.StageDescription
                })
                .ToListAsync();

            List<string> workflowDepts = new();
            if (!string.IsNullOrEmpty(service.WorkflowDepartments))
            {
                try { workflowDepts = JsonSerializer.Deserialize<List<string>>(service.WorkflowDepartments) ?? new(); }
                catch { }
            }

            return Ok(new
            {
                serviceId = service.Id,
                serviceName = service.Name,
                totalStages = service.TotalStages,
                workflowDepartments = workflowDepts,
                stageForms = templates
            });
        }

        // The department handling a service category, and the email of its active Department Admin.
        private async Task<(string Name, string Email)> ResolveDepartmentAsync(string? category)
        {
            var name = category != null && DepartmentByCategory.TryGetValue(category, out var dept)
                ? dept
                : string.IsNullOrWhiteSpace(category) ? "General" : category;

            var email = await _context.Officers
                .Where(o => o.Department == name && o.Role == "Department Admin" && o.Status == "Active")
                .OrderBy(o => o.CreatedAt)
                .Select(o => o.Email)
                .FirstOrDefaultAsync();

            return (name, email ?? string.Empty);
        }

        private const long MaxDocumentBytes = UploadedFileTypes.MaxBytes;

        // Uploads one supporting document (PDF / JPEG / PNG, max 10 MB) for a "file" field. The returned id is
        // sent in SubmitApplicationRequest.Documents; unattached uploads are never shown to officers.
        [HttpPost("documents")]
        [RequestSizeLimit(MaxDocumentBytes + 64 * 1024)]
        public async Task<IActionResult> UploadDocument([FromForm] UploadDocumentRequest request)
        {
            var file = request.File;
            var nic = User.FindFirstValue("nicNumber");
            if (string.IsNullOrWhiteSpace(nic)) return Forbid();

            if (file == null || file.Length == 0) return BadRequest(new { message = "Choose a file to upload." });
            if (file.Length > MaxDocumentBytes) return BadRequest(new { message = "Files must be 10 MB or smaller." });

            using var buffer = new MemoryStream();
            await file.CopyToAsync(buffer);
            var content = buffer.ToArray();

            // Decide the type from the file's bytes, not the client-supplied header
            var contentType = UploadedFileTypes.Detect(content);
            if (contentType == null) return BadRequest(new { message = "Only PDF, JPEG and PNG files are accepted." });

            var document = new SubmissionDocument
            {
                FieldLabel = request.FieldLabel?.Trim() ?? string.Empty,
                FileName = Path.GetFileName(file.FileName),
                ContentType = contentType,
                SizeBytes = content.LongLength,
                Content = content,
                UploaderNic = nic,
                UploadedAt = DateTime.UtcNow
            };
            _context.SubmissionDocuments.Add(document);
            await _context.SaveChangesAsync();

            return Ok(new { id = document.Id, fileName = document.FileName, contentType, sizeBytes = document.SizeBytes });
        }

        [HttpPost("submit")]
        public async Task<IActionResult> Submit([FromBody] SubmitApplicationRequest request)
        {
            var nic = User.FindFirstValue("nicNumber");
            if (string.IsNullOrWhiteSpace(nic)) return Forbid();

            var service = await _context.ServiceProcedures.FindAsync(request.ServiceProcedureId);
            if (service == null || service.Status == "Retired") return NotFound("Service not found.");

            // Uploaded documents: must belong to the caller and not already be attached to another application
            var documentIds = request.Documents.Values.Distinct().ToList();
            var documents = await _context.SubmissionDocuments
                .Where(d => documentIds.Contains(d.Id) && d.UploaderNic == nic && d.ApplicationId == null)
                .ToDictionaryAsync(d => d.Id);
            if (documents.Count != documentIds.Count)
                return BadRequest(new { message = "One or more uploaded documents are invalid. Please upload them again." });

            // The stored answer for a file field is the uploaded file's name
            foreach (var (label, id) in request.Documents)
                request.Answers[label] = documents[id].FileName;

            string? targetDept = null;
            int stageOrder = 1;
            Template? template = null;

            if (request.TemplateId.HasValue)
            {
                template = await _context.Templates
                    .Include(t => t.Fields)
                    .FirstOrDefaultAsync(t => t.Id == request.TemplateId.Value
                                              && t.ServiceProcedureId == request.ServiceProcedureId);
                if (template == null) return BadRequest("Form does not belong to this service.");

                targetDept = template.Department;
                stageOrder = template.StageOrder;

                var missing = template.Fields
                    .Where(f => f.IsRequired && !DisplayOnlyTypes.Contains(f.Type))
                    .Where(f => !request.Answers.TryGetValue(f.Label, out var v) || string.IsNullOrWhiteSpace(v))
                    .Select(f => f.Label)
                    .ToList();
                if (missing.Count > 0)
                    return BadRequest(new { message = "Required fields are missing.", missingFields = missing });

                var invalid = ApplicationAnswersValidator.Validate(template.Fields, request.Answers);
                if (invalid.Count > 0)
                    return BadRequest(new { message = string.Join(" ", invalid.Values), errors = invalid.Values, invalidFields = invalid });
            }

            // Footer values are set server-side so the client can't alter which department receives it.
            var (defaultDept, departmentEmail) = await ResolveDepartmentAsync(service.Category);
            var finalDept = targetDept ?? defaultDept;
            request.Answers[PresentedByKey] = finalDept;
            request.Answers[EmailKey] = departmentEmail;

            var maxStages = service.TotalStages > 0 ? service.TotalStages : 1;

            ApplicationSubmission? submission = null;
            if (request.ApplicationId.HasValue && request.ApplicationId.Value > 0)
            {
                submission = await _context.ApplicationSubmissions
                    .FirstOrDefaultAsync(s => s.Id == request.ApplicationId.Value && s.CitizenNic == nic);

                if (submission != null && submission.StageStatus == "Completed")
                {
                    return BadRequest(new 
                    { 
                        message = "This application has already completed all stages and was officially approved. Further edits or re-submission are not permitted.",
                        applicationId = submission.Id,
                        status = "Completed"
                    });
                }
            }

            if (submission == null)
            {
                // Check if citizen already has a completed or active application for this service
                var existingSubmission = await _context.ApplicationSubmissions
                    .Where(s => s.CitizenNic == nic && s.ServiceProcedureId == service.Id && s.StageStatus != "Deleted")
                    .OrderByDescending(s => s.Id)
                    .FirstOrDefaultAsync();

                if (existingSubmission != null)
                {
                    if (existingSubmission.StageStatus == "Completed")
                    {
                        return BadRequest(new 
                        { 
                            message = $"An approved application already exists for this service (Ref: APP-{existingSubmission.Id}). Duplicate submissions are not permitted under statutory regulations.",
                            duplicate = true,
                            existingApplicationId = existingSubmission.Id
                        });
                    }

                    if (existingSubmission.StageStatus == "PendingReview" &&
                        await _context.VerificationTasks.AnyAsync(t => t.ApplicationId == existingSubmission.Id && (t.Status == "Pending" || t.Status == "Revised")))
                    {
                        return BadRequest(new 
                        { 
                            message = $"An active application is already under review in the verification queue (Ref: APP-{existingSubmission.Id}). Duplicate submission is prohibited.",
                            duplicate = true,
                            existingApplicationId = existingSubmission.Id
                        });
                    }

                    if (existingSubmission.StageStatus == "AwaitingFeePayment" || existingSubmission.StageStatus == "Draft")
                    {
                        submission = existingSubmission;
                    }
                }
            }

            if (submission != null)
            {
                submission.TemplateId = request.TemplateId;
                submission.UserEmail = User.FindFirstValue(ClaimTypes.Email) ?? submission.UserEmail;
                submission.FormDataJson = JsonSerializer.Serialize(request.Answers);
                submission.SubmittedAt = DateTime.UtcNow;
                submission.CurrentStage = stageOrder;
                submission.MaxStages = maxStages;
                submission.CurrentDepartment = finalDept;
                submission.StageStatus = "PendingReview";
            }
            else
            {
                submission = new ApplicationSubmission
                {
                    ServiceProcedureId = service.Id,
                    TemplateId = request.TemplateId,
                    CitizenNic = nic,
                    UserEmail = User.FindFirstValue(ClaimTypes.Email) ?? string.Empty,
                    FormDataJson = JsonSerializer.Serialize(request.Answers),
                    SubmittedAt = DateTime.UtcNow,
                    CurrentStage = stageOrder,
                    MaxStages = maxStages,
                    CurrentDepartment = finalDept,
                    StageStatus = "PendingReview"
                };
            }

            // 1. Build Draft Application for Agent 4
            var derivedAge = ApplicationDraftingService.AgeFromNic(nic, DateTime.UtcNow);
            int citizenAge = derivedAge ?? 0;
            if (citizenAge == 0)
            {
                var ageKey = request.Answers.Keys.FirstOrDefault(k => k.Contains("age", StringComparison.OrdinalIgnoreCase));
                if (ageKey != null && int.TryParse(request.Answers[ageKey], out var parsedAge))
                {
                    citizenAge = parsedAge;
                }
            }
            if (citizenAge == 0)
            {
                citizenAge = 25; // Default valid legal age
            }

            var attachedDocList = new List<string>();
            foreach (var doc in documents.Values)
            {
                attachedDocList.Add(doc.FileName);
                if (!string.IsNullOrWhiteSpace(doc.FieldLabel))
                {
                    attachedDocList.Add(doc.FieldLabel);
                    attachedDocList.Add($"{doc.FieldLabel}: {doc.FileName}");
                }
            }
            foreach (var label in request.Documents.Keys)
            {
                if (!attachedDocList.Contains(label))
                {
                    attachedDocList.Add(label);
                }
            }

            decimal stageInitialFee = 0m;
            if (template != null)
            {
                var paymentField = template.Fields.FirstOrDefault(f => f.Type == "payment");
                if (paymentField != null && !string.IsNullOrWhiteSpace(paymentField.Options))
                {
                    try
                    {
                        using var pDoc = JsonDocument.Parse(paymentField.Options);
                        if (pDoc.RootElement.TryGetProperty("amount", out var amt)) stageInitialFee = amt.GetDecimal();
                    }
                    catch { }
                }
            }

            var draft = new DraftApplication
            {
                ApplicationId = submission.Id, // Set to existing ID if adopting, or 0 if brand new
                ServiceProcedureId = service.Id,
                ServiceName = service.Name,
                CitizenNic = nic,
                CitizenName = User.FindFirstValue(ClaimTypes.Name) ?? nic,
                CitizenAge = citizenAge,
                FormFields = request.Answers,
                AttachedDocumentNames = attachedDocList,
                CalculatedFee = stageInitialFee,
                Stage = stageOrder,
                MaxStages = maxStages,
                DepartmentName = finalDept
            };

            // Identify required document fields for this template/stage
            List<string>? requiredDocs = null;
            if (template != null)
            {
                var reqFileFields = template.Fields
                    .Where(f => f.IsRequired && (f.Type == "file" || f.Type == "document" || f.Type == "documentUpload"))
                    .Select(f => f.Label.Trim().TrimEnd(':').Trim())
                    .ToList();
                requiredDocs = reqFileFields;
            }
            requiredDocs ??= new List<string>();

            // 2. Run Agent 4 (Schema, Duplicates, Risk Scoring)
            var validationResult = await _safetyAgent.ValidateAndEnqueueAsync(draft, requiredDocs);

            if (!validationResult.IsValid)
            {
                return BadRequest(new 
                { 
                    message = "Application safety validation failed.", 
                    errors = validationResult.RejectionReasons,
                    summary = validationResult.Summary
                });
            }

            if (submission.Id == 0)
            {
                _context.ApplicationSubmissions.Add(submission);
            }
            await _context.SaveChangesAsync();

            // Clean up any remaining older placeholder drafts or orphaned PendingReview records
            // (PendingReview with no VerificationTask = stuck from a previous failed submission attempt)
            var orphanedPendingIds = await _context.ApplicationSubmissions
                .Where(s => s.CitizenNic == nic &&
                            s.ServiceProcedureId == service.Id &&
                            s.Id != submission.Id &&
                            s.StageStatus == "PendingReview" &&
                            !_context.VerificationTasks.Any(t => t.ApplicationId == s.Id))
                .Select(s => s.Id)
                .ToListAsync();

            var olderDrafts = await _context.ApplicationSubmissions
                .Where(s => s.CitizenNic == nic && 
                            s.ServiceProcedureId == service.Id && 
                            s.Id != submission.Id && 
                            (s.StageStatus == "AwaitingFeePayment" || s.StageStatus == "Draft" ||
                             orphanedPendingIds.Contains(s.Id)))
                .ToListAsync();
            foreach (var od in olderDrafts)
            {
                od.StageStatus = "Deleted";
            }
            if (olderDrafts.Count > 0)
            {
                await _context.SaveChangesAsync();
            }

            _duplicateTool.RegisterApplication(nic, service.Id, $"APP-2026-{submission.Id}");

            foreach (var (label, id) in request.Documents)
            {
                documents[id].ApplicationId = submission.Id;
                documents[id].FieldLabel = label;
            }
            if (documents.Count > 0) await _context.SaveChangesAsync();

            // Services with custom stage templates: only require payment if THIS stage has a payment field
            FeeCalculationResult? stageFeeResult = null;

            if (template != null)
            {
                var paymentField = template.Fields.FirstOrDefault(f => f.Type == "payment");
                if (paymentField != null && !string.IsNullOrWhiteSpace(paymentField.Options))
                {
                    try
                    {
                        using var pDoc = JsonDocument.Parse(paymentField.Options);
                        if (pDoc.RootElement.TryGetProperty("amount", out var amt) && amt.GetDecimal() > 0)
                        {
                            var stageAmt = amt.GetDecimal();
                            string feeName = pDoc.RootElement.TryGetProperty("feeType", out var ft)
                                ? ft.GetString() ?? paymentField.Label
                                : paymentField.Label;

                            bool paymentProvided = false;
                            var cleanFieldLabel = paymentField.Label.Trim().TrimEnd(':');

                            // Check if an existing payment was already recorded for this application and stage amount
                            var existingPayment = await _context.Payments
                                .OrderByDescending(p => p.CreatedDate)
                                .FirstOrDefaultAsync(p => p.ApplicationId == submission.Id && Math.Abs(p.Amount - stageAmt) < 0.01m);

                            // 1. Check if citizen uploaded a bank deposit slip
                            var matchedDocKvp = request.Documents.FirstOrDefault(kvp =>
                                string.Equals(kvp.Key.Trim().TrimEnd(':'), cleanFieldLabel, StringComparison.OrdinalIgnoreCase)
                                || kvp.Key.Contains("slip", StringComparison.OrdinalIgnoreCase)
                                || kvp.Key.Contains("deposit", StringComparison.OrdinalIgnoreCase)
                                || kvp.Key.Contains("payment", StringComparison.OrdinalIgnoreCase));
                            if (matchedDocKvp.Value != Guid.Empty && documents.TryGetValue(matchedDocKvp.Value, out var slipDoc))
                            {
                                if (existingPayment != null)
                                {
                                    if (string.IsNullOrEmpty(existingPayment.ManualSlipUrl) || 
                                        existingPayment.ManualSlipUrl.StartsWith("ref-", StringComparison.OrdinalIgnoreCase) || 
                                        existingPayment.ManualSlipUrl.StartsWith("slip-", StringComparison.OrdinalIgnoreCase) || 
                                        existingPayment.ManualSlipUrl.StartsWith("PAY-", StringComparison.OrdinalIgnoreCase))
                                    {
                                        existingPayment.ManualSlipUrl = $"/api/verification/documents/{slipDoc.Id}/content";
                                    }
                                    if (existingPayment.Amount <= 0)
                                    {
                                        existingPayment.Amount = stageAmt;
                                    }
                                    await _context.SaveChangesAsync();
                                    paymentProvided = true;
                                }
                                else
                                {
                                    var payment = new Payment
                                    {
                                        ApplicationId = submission.Id,
                                        Amount = stageAmt,
                                        Currency = "LKR",
                                        Method = "Bank Deposit",
                                        Status = "PendingVerification",
                                        ManualSlipUrl = $"/api/verification/documents/{slipDoc.Id}/content",
                                        UserEmail = submission.UserEmail,
                                        CreatedDate = DateTime.UtcNow
                                    };
                                    _context.Payments.Add(payment);
                                    await _context.SaveChangesAsync();
                                    paymentProvided = true;
                                }
                            }
                            // 2. Check if citizen provided an online transaction reference
                            var matchedAnswerKvp = request.Answers.FirstOrDefault(kvp =>
                                string.Equals(kvp.Key.Trim().TrimEnd(':'), cleanFieldLabel, StringComparison.OrdinalIgnoreCase));
                            if (!paymentProvided && !string.IsNullOrWhiteSpace(matchedAnswerKvp.Value))
                            {
                                var refVal = matchedAnswerKvp.Value.Trim();
                                var isOnline = refVal.StartsWith("Online Ref:", StringComparison.OrdinalIgnoreCase);
                                var cleanRef = refVal.Replace("Online Ref:", "", StringComparison.OrdinalIgnoreCase).Trim();
                                if (!string.IsNullOrWhiteSpace(cleanRef) && !cleanRef.StartsWith("Bank Deposit Slip:", StringComparison.OrdinalIgnoreCase))
                                {
                                    var fallbackSlipDoc = documents.Values.FirstOrDefault(d =>
                                        d.FieldLabel.Contains("slip", StringComparison.OrdinalIgnoreCase) ||
                                        d.FieldLabel.Contains("deposit", StringComparison.OrdinalIgnoreCase) ||
                                        d.FieldLabel.Contains("payment", StringComparison.OrdinalIgnoreCase) ||
                                        d.FileName.Contains("slip", StringComparison.OrdinalIgnoreCase) ||
                                        d.FileName.Contains("deposit", StringComparison.OrdinalIgnoreCase))
                                        ?? (!isOnline ? documents.Values.LastOrDefault() : null);

                                    var refPayment = existingPayment ?? await _context.Payments
                                        .FirstOrDefaultAsync(p => (p.ApplicationId == submission.Id || p.StripePaymentIntentId == cleanRef || p.StripePaymentIntentId == refVal) && (p.StripePaymentIntentId == cleanRef || p.StripePaymentIntentId == refVal));
                                    if (refPayment != null)
                                    {
                                        refPayment.ApplicationId = submission.Id;
                                        if (fallbackSlipDoc != null && (string.IsNullOrEmpty(refPayment.ManualSlipUrl) || refPayment.ManualSlipUrl.StartsWith("ref-") || refPayment.ManualSlipUrl.StartsWith("slip-")))
                                        {
                                            refPayment.ManualSlipUrl = $"/api/verification/documents/{fallbackSlipDoc.Id}/content";
                                        }
                                        await _context.SaveChangesAsync();
                                        paymentProvided = true;
                                    }
                                    else
                                    {
                                        var payment = new Payment
                                        {
                                            ApplicationId = submission.Id,
                                            Amount = stageAmt,
                                            Currency = "LKR",
                                            Method = isOnline ? "Online" : "Bank Deposit",
                                            Status = isOnline ? "Paid" : "PendingVerification",
                                            StripePaymentIntentId = cleanRef,
                                            ManualSlipUrl = isOnline ? null : (fallbackSlipDoc != null ? $"/api/verification/documents/{fallbackSlipDoc.Id}/content" : null),
                                            UserEmail = submission.UserEmail,
                                            CreatedDate = DateTime.UtcNow,
                                            PaidDate = isOnline ? DateTime.UtcNow : null
                                        };
                                        _context.Payments.Add(payment);
                                        await _context.SaveChangesAsync();
                                        paymentProvided = true;
                                    }
                                }
                            }

                            if (!paymentProvided)
                            {
                                stageFeeResult = new FeeCalculationResult
                                {
                                    TotalAmount = stageAmt,
                                    Currency = "LKR",
                                    LineItems = new List<FeeLineItem> { new FeeLineItem(feeName, stageAmt) }
                                };
                            }
                        }
                    }
                    catch { }
                }
            }
            else if (service.TotalStages <= 1)
            {
                var generalFee = await _feeTool.CalculateAsync(service.Id);
                if (generalFee.TotalAmount > 0) stageFeeResult = generalFee;
            }

            if (stageFeeResult != null && stageFeeResult.TotalAmount > 0)
                return Ok(PaymentRequiredResponse(submission, service.Name, stageFeeResult));

            return Ok(await SendToVerificationAsync(submission, service.Name, nic, validationResult.ComplianceChecks));
        }

        // Called after paying: once Paid payments (or an installment plan with its first installment paid) cover
        // the fee, the application is sent to the officer queue.
        // Idempotent — returns the existing task if the application was already finalized.
        [HttpPost("{applicationId:int}/finalize")]
        public async Task<IActionResult> Finalize(int applicationId)
        {
            var nic = User.FindFirstValue("nicNumber");
            if (string.IsNullOrWhiteSpace(nic)) return Forbid();

            var submission = await _context.ApplicationSubmissions
                .Include(s => s.ServiceProcedure)
                .FirstOrDefaultAsync(s => s.Id == applicationId && s.CitizenNic == nic);
            if (submission?.ServiceProcedure == null) return NotFound("Application not found.");
            var serviceName = submission.ServiceProcedure.Name;

            var existingTask = await _context.VerificationTasks.FirstOrDefaultAsync(t => t.ApplicationId == applicationId);
            if (existingTask != null)
                return Ok(SubmittedResponse(submission, serviceName, existingTask.Id));

            // Determine required fee for this submission's current stage
            decimal requiredAmount = 0m;
            FeeCalculationResult fee;

            var currentTemplate = await _context.Templates
                .Include(t => t.Fields)
                .FirstOrDefaultAsync(t => t.ServiceProcedureId == submission.ServiceProcedureId && t.StageOrder == submission.CurrentStage && t.Status == "Active");
            var finalizePaymentField = currentTemplate?.Fields.FirstOrDefault(f => f.Type == "payment");
            if (finalizePaymentField != null && !string.IsNullOrWhiteSpace(finalizePaymentField.Options))
            {
                decimal stageAmt = 0m;
                string feeName = finalizePaymentField.Label;
                try
                {
                    using var pDoc = JsonDocument.Parse(finalizePaymentField.Options);
                    if (pDoc.RootElement.TryGetProperty("amount", out var amt)) stageAmt = amt.GetDecimal();
                    if (pDoc.RootElement.TryGetProperty("feeType", out var ft) && ft.GetString() is string s) feeName = s;
                }
                catch { }

                fee = new FeeCalculationResult
                {
                    TotalAmount = stageAmt,
                    Currency = "LKR",
                    LineItems = new List<FeeLineItem> { new FeeLineItem(feeName, stageAmt) }
                };
                requiredAmount = stageAmt;
            }
            else
            {
                fee = await _feeTool.CalculateAsync(submission.ServiceProcedureId);
                requiredAmount = fee.TotalAmount;
            }

            var paid = await _context.Payments
                .Where(p => p.ApplicationId == applicationId && p.Status == "Paid")
                .SumAsync(p => (decimal?)p.Amount) ?? 0m;

            // An installment plan covering the fee counts once its first installment is paid
            var paymentIds = await _context.Payments
                .Where(p => p.ApplicationId == applicationId)
                .Select(p => p.Id)
                .ToListAsync();
            var onInstallmentPlan = await _context.InstallmentPlans
                .AnyAsync(ip => paymentIds.Contains(ip.PaymentId)
                                && (ip.Status == "Active" || ip.Status == "Completed")
                                && ip.TotalAmount >= requiredAmount
                                && ip.Installments!.Any(i => i.Status == "Paid"));

            if (paid < requiredAmount && !onInstallmentPlan)
                return StatusCode(StatusCodes.Status402PaymentRequired, PaymentRequiredResponse(submission, serviceName, fee, paid));

            return Ok(await SendToVerificationAsync(submission, serviceName, nic));
        }

        private async Task<object> SendToVerificationAsync(ApplicationSubmission submission, string serviceName, string nic, List<ComplianceCheckItem>? checks = null)
        {
            var task = await _verificationService.CreateTaskAsync(new CreateTaskRequest
            {
                ApplicationId = submission.Id,
                CitizenNic = nic,
                Department = submission.CurrentDepartment,
                StageNumber = submission.CurrentStage
            }, User.FindFirstValue(ClaimTypes.NameIdentifier) ?? "Citizen");
            if (checks != null && checks.Count > 0)
            {
                foreach (var c in checks)
                {
                    _context.ComplianceChecks.Add(new ComplianceCheck
                    {
                        TaskId = task.Id,
                        CheckType = c.CheckType,
                        IsPassed = c.IsPassed,
                        Details = c.Details
                    });
                }
                await _context.SaveChangesAsync();
            }

            return SubmittedResponse(submission, serviceName, task.Id);
        }

        private static object SubmittedResponse(ApplicationSubmission submission, string serviceName, int taskId) => new
        {
            applicationId = submission.Id,
            taskId,
            referenceNumber = $"APP-{submission.Id}",
            serviceName,
            paymentRequired = false
        };

        private static object PaymentRequiredResponse(ApplicationSubmission submission, string serviceName, FeeCalculationResult fee, decimal paid = 0m) => new
        {
            applicationId = submission.Id,
            referenceNumber = $"APP-{submission.Id}",
            serviceName,
            paymentRequired = true,
            message = "Pay the service fee to submit your application.",
            amount = fee.TotalAmount - paid,
            totalFee = fee.TotalAmount,
            amountPaid = paid,
            currency = fee.Currency,
            feeItems = fee.LineItems.Select(i => new { i.FeeType, i.Amount }),
            userEmail = submission.UserEmail
        };

        // Submits the next sequential stage application form (e.g. Stage 2 for Department B)
        [HttpPost("submit-stage")]
        public async Task<IActionResult> SubmitStage([FromBody] SubmitStageRequest request)
        {
            var nic = User.FindFirstValue("nicNumber");
            if (string.IsNullOrWhiteSpace(nic)) return Forbid();

            var submission = await _context.ApplicationSubmissions
                .Include(s => s.ServiceProcedure)
                .FirstOrDefaultAsync(s => s.Id == request.ApplicationId && s.CitizenNic == nic);
            if (submission == null) return NotFound("Application not found.");

            var template = await _context.Templates
                .Include(t => t.Fields)
                .FirstOrDefaultAsync(t => t.Id == request.TemplateId && t.ServiceProcedureId == submission.ServiceProcedureId);
            if (template == null) return BadRequest("Form template does not belong to this service.");

            // Uploaded documents: must belong to the caller and not already attached
            var documentIds = request.Documents.Values.Distinct().ToList();
            var documents = await _context.SubmissionDocuments
                .Where(d => documentIds.Contains(d.Id) && d.UploaderNic == nic && d.ApplicationId == null)
                .ToDictionaryAsync(d => d.Id);

            foreach (var (label, id) in request.Documents)
            {
                if (documents.TryGetValue(id, out var doc))
                {
                    request.Answers[label] = doc.FileName;
                    doc.ApplicationId = submission.Id;
                    doc.FieldLabel = label;
                }
            }

            // Validate required fields of this stage template
            var missing = template.Fields
                .Where(f => f.IsRequired && !DisplayOnlyTypes.Contains(f.Type))
                .Where(f => !request.Answers.TryGetValue(f.Label, out var v) || string.IsNullOrWhiteSpace(v))
                .Select(f => f.Label)
                .ToList();
            if (missing.Count > 0)
                return BadRequest(new { message = $"Required fields are missing for Stage {template.StageOrder}.", missingFields = missing });

            var invalid = ApplicationAnswersValidator.Validate(template.Fields, request.Answers);
            if (invalid.Count > 0)
                return BadRequest(new { message = string.Join(" ", invalid.Values), errors = invalid.Values, invalidFields = invalid });

            // Identify required document fields for this stage
            var stageRequiredDocs = template.Fields
                .Where(f => f.IsRequired && (f.Type == "file" || f.Type == "document" || f.Type == "documentUpload"))
                .Select(f => f.Label.Trim().TrimEnd(':').Trim())
                .ToList();

            var stageAttachedDocs = new List<string>();
            foreach (var doc in documents.Values)
            {
                stageAttachedDocs.Add(doc.FileName);
                if (!string.IsNullOrWhiteSpace(doc.FieldLabel))
                {
                    stageAttachedDocs.Add(doc.FieldLabel);
                    stageAttachedDocs.Add($"{doc.FieldLabel}: {doc.FileName}");
                }
            }
            foreach (var label in request.Documents.Keys)
            {
                if (!stageAttachedDocs.Contains(label))
                    stageAttachedDocs.Add(label);
            }

            var derivedAge = ApplicationDraftingService.AgeFromNic(nic, DateTime.UtcNow);
            int citizenAge = derivedAge ?? 25;

            decimal stageAmt = 0m;
            var stagePaymentField = template.Fields.FirstOrDefault(f => f.Type == "payment");
            if (stagePaymentField != null && !string.IsNullOrWhiteSpace(stagePaymentField.Options))
            {
                try
                {
                    using var pDoc = JsonDocument.Parse(stagePaymentField.Options);
                    if (pDoc.RootElement.TryGetProperty("amount", out var amt)) stageAmt = amt.GetDecimal();
                }
                catch { }
            }

            var draft = new DraftApplication
            {
                ApplicationId = submission.Id,
                ServiceProcedureId = submission.ServiceProcedureId,
                ServiceName = submission.ServiceProcedure?.Name ?? "Service",
                CitizenNic = nic,
                CitizenName = User.FindFirstValue(ClaimTypes.Name) ?? nic,
                CitizenAge = citizenAge,
                FormFields = request.Answers,
                AttachedDocumentNames = stageAttachedDocs,
                CalculatedFee = stageAmt,
                Stage = template.StageOrder
            };

            // Run Agent 4 (Validation & Safety Agent) for this stage
            var validationResult = await _safetyAgent.ValidateAndEnqueueAsync(draft, stageRequiredDocs);
            if (!validationResult.IsValid)
            {
                return BadRequest(new
                {
                    message = $"Stage {template.StageOrder} safety validation failed.",
                    errors = validationResult.RejectionReasons,
                    summary = validationResult.Summary
                });
            }

            // Merge answers into existing form data
            Dictionary<string, string> currentAnswers = new();
            try { currentAnswers = JsonSerializer.Deserialize<Dictionary<string, string>>(submission.FormDataJson) ?? new(); }
            catch { }

            currentAnswers.Remove($"[Draft Stage {template.StageOrder}]");
            foreach (var kvp in request.Answers)
            {
                currentAnswers[$"[Stage {template.StageOrder}] {kvp.Key}"] = kvp.Value;
            }

            submission.FormDataJson = JsonSerializer.Serialize(currentAnswers);
            submission.CurrentStage = template.StageOrder;
            submission.CurrentDepartment = template.Department;
            submission.StageStatus = "PendingReview";

            // Enqueue new verification task for the new department!
            var task = await _verificationService.CreateTaskAsync(new CreateTaskRequest
            {
                ApplicationId = submission.Id,
                CitizenNic = nic,
                Department = template.Department,
                StageNumber = template.StageOrder
            }, User.FindFirstValue(ClaimTypes.NameIdentifier) ?? "Citizen");

            await _context.SaveChangesAsync();
            _duplicateTool.RegisterApplication(nic, submission.ServiceProcedureId, $"APP-2026-{submission.Id}");

            // Check if THIS sequential stage has a payment field
            if (stagePaymentField != null && stageAmt > 0)
            {
                string feeName = stagePaymentField.Label;
                try
                {
                    using var pDoc = JsonDocument.Parse(stagePaymentField.Options ?? "{}");
                    if (pDoc.RootElement.TryGetProperty("feeType", out var ft) && ft.GetString() is string s && !string.IsNullOrWhiteSpace(s))
                        feeName = s;
                }
                catch { }

                bool stagePaymentProvided = false;
                var cleanStageLabel = stagePaymentField.Label.Trim().TrimEnd(':');

                // Check if an existing payment was already recorded for this application and stage amount
                var existingStagePayment = await _context.Payments
                    .OrderByDescending(p => p.CreatedDate)
                    .FirstOrDefaultAsync(p => p.ApplicationId == submission.Id && Math.Abs(p.Amount - stageAmt) < 0.01m);

                // 1. Check if citizen uploaded a bank deposit slip
                var matchedDocKvp = request.Documents.FirstOrDefault(kvp =>
                    string.Equals(kvp.Key.Trim().TrimEnd(':'), cleanStageLabel, StringComparison.OrdinalIgnoreCase)
                    || kvp.Key.Contains("slip", StringComparison.OrdinalIgnoreCase)
                    || kvp.Key.Contains("deposit", StringComparison.OrdinalIgnoreCase)
                    || kvp.Key.Contains("payment", StringComparison.OrdinalIgnoreCase));
                if (matchedDocKvp.Value != Guid.Empty && documents.TryGetValue(matchedDocKvp.Value, out var slipDoc))
                {
                    if (existingStagePayment != null)
                    {
                        if (string.IsNullOrEmpty(existingStagePayment.ManualSlipUrl) || 
                            existingStagePayment.ManualSlipUrl.StartsWith("ref-", StringComparison.OrdinalIgnoreCase) || 
                            existingStagePayment.ManualSlipUrl.StartsWith("slip-", StringComparison.OrdinalIgnoreCase) || 
                            existingStagePayment.ManualSlipUrl.StartsWith("PAY-", StringComparison.OrdinalIgnoreCase))
                        {
                            existingStagePayment.ManualSlipUrl = $"/api/verification/documents/{slipDoc.Id}/content";
                        }
                        if (existingStagePayment.Amount <= 0)
                        {
                            existingStagePayment.Amount = stageAmt;
                        }
                        await _context.SaveChangesAsync();
                        stagePaymentProvided = true;
                    }
                    else
                    {
                        var payment = new Payment
                        {
                            ApplicationId = submission.Id,
                            Amount = stageAmt,
                            Currency = "LKR",
                            Method = "Bank Deposit",
                            Status = "PendingVerification",
                            ManualSlipUrl = $"/api/verification/documents/{slipDoc.Id}/content",
                            UserEmail = submission.UserEmail,
                            CreatedDate = DateTime.UtcNow
                        };
                        _context.Payments.Add(payment);
                        await _context.SaveChangesAsync();
                        stagePaymentProvided = true;
                    }
                }
                // 2. Check if citizen provided an online transaction reference
                var matchedAnswerKvp = request.Answers.FirstOrDefault(kvp =>
                    string.Equals(kvp.Key.Trim().TrimEnd(':'), cleanStageLabel, StringComparison.OrdinalIgnoreCase));
                if (!stagePaymentProvided && !string.IsNullOrWhiteSpace(matchedAnswerKvp.Value))
                {
                    var refVal = matchedAnswerKvp.Value.Trim();
                    var isOnline = refVal.StartsWith("Online Ref:", StringComparison.OrdinalIgnoreCase);
                    var cleanRef = refVal.Replace("Online Ref:", "", StringComparison.OrdinalIgnoreCase).Trim();
                    if (!string.IsNullOrWhiteSpace(cleanRef) && !cleanRef.StartsWith("Bank Deposit Slip:", StringComparison.OrdinalIgnoreCase))
                    {
                        var fallbackSlipDoc = documents.Values.FirstOrDefault(d =>
                            d.FieldLabel.Contains("slip", StringComparison.OrdinalIgnoreCase) ||
                            d.FieldLabel.Contains("deposit", StringComparison.OrdinalIgnoreCase) ||
                            d.FieldLabel.Contains("payment", StringComparison.OrdinalIgnoreCase) ||
                            d.FileName.Contains("slip", StringComparison.OrdinalIgnoreCase) ||
                            d.FileName.Contains("deposit", StringComparison.OrdinalIgnoreCase))
                            ?? (!isOnline ? documents.Values.LastOrDefault() : null);

                        var refPayment = existingStagePayment ?? await _context.Payments
                            .FirstOrDefaultAsync(p => p.ApplicationId == submission.Id && (p.StripePaymentIntentId == cleanRef || p.StripePaymentIntentId == refVal));
                        if (refPayment != null)
                        {
                            if (fallbackSlipDoc != null && (string.IsNullOrEmpty(refPayment.ManualSlipUrl) || refPayment.ManualSlipUrl.StartsWith("ref-") || refPayment.ManualSlipUrl.StartsWith("slip-")))
                            {
                                refPayment.ManualSlipUrl = $"/api/verification/documents/{fallbackSlipDoc.Id}/content";
                            }
                            await _context.SaveChangesAsync();
                            stagePaymentProvided = true;
                        }
                        else
                        {
                            var payment = new Payment
                            {
                                ApplicationId = submission.Id,
                                Amount = stageAmt,
                                Currency = "LKR",
                                Method = isOnline ? "Online" : "Bank Deposit",
                                Status = isOnline ? "Paid" : "PendingVerification",
                                StripePaymentIntentId = cleanRef,
                                ManualSlipUrl = isOnline ? null : (fallbackSlipDoc != null ? $"/api/verification/documents/{fallbackSlipDoc.Id}/content" : null),
                                UserEmail = submission.UserEmail,
                                CreatedDate = DateTime.UtcNow,
                                PaidDate = isOnline ? DateTime.UtcNow : null
                            };
                            _context.Payments.Add(payment);
                            await _context.SaveChangesAsync();
                            stagePaymentProvided = true;
                        }
                    }
                }

                if (!stagePaymentProvided)
                {
                    var stageFee = new FeeCalculationResult
                    {
                        TotalAmount = stageAmt,
                        Currency = "LKR",
                        LineItems = new List<FeeLineItem> { new FeeLineItem(feeName, stageAmt) }
                    };
                    return Ok(PaymentRequiredResponse(submission, submission.ServiceProcedure?.Name ?? "Service", stageFee));
                }
            }

            return Ok(new
            {
                applicationId = submission.Id,
                taskId = task.Id,
                currentStage = submission.CurrentStage,
                department = template.Department,
                status = "PendingReview",
                message = $"Stage {template.StageOrder} application submitted for verification by {template.Department}."
            });
        }

        // Citizen raises a concern or request for support assistance when an application review fails or is rejected
        [HttpPost("{id:int}/raise-concern")]
        [AllowAnonymous]
        public async Task<IActionResult> RaiseConcern(int id, [FromBody] RaiseConcernDto dto)
        {
            var submission = await _context.ApplicationSubmissions
                .Include(s => s.ServiceProcedure)
                .FirstOrDefaultAsync(s => s.Id == id);

            if (submission == null) return NotFound(new { message = $"Application #{id} not found." });

            var email = User.FindFirstValue(ClaimTypes.Email) ?? User.FindFirst("email")?.Value ?? User.Identity?.Name ?? submission.UserEmail;
            var ticketRef = $"CONCERN-{id}-{Guid.NewGuid().ToString("N")[..6].ToUpper()}";

            var audit = new AuditLog
            {
                ApplicationId = id,
                Action = "Citizen Support Concern Raised",
                PerformedBy = email,
                Timestamp = DateTime.UtcNow,
                OldValues = $"Status: {submission.StageStatus}",
                NewValues = $"Ticket: {ticketRef}, Subject: {dto.Subject}, Message: {dto.Message}, Phone: {dto.ContactPhone ?? "N/A"}"
            };
            _context.AuditLogs.Add(audit);
            await _context.SaveChangesAsync();

            return Ok(new
            {
                ticketReference = ticketRef,
                applicationId = id,
                department = submission.CurrentDepartment ?? "Department Desk",
                serviceName = submission.ServiceProcedure?.Name ?? "Application Service",
                subject = dto.Subject,
                status = "ConcernLogged",
                message = "Your support concern has been logged and escalated to the department officer. Reference ID: " + ticketRef
            });
        }

        // Citizen resubmits requested correction/document for an application requiring revision
        [HttpPost("{id:int}/submit-revision")]
        [AllowAnonymous]
        public async Task<IActionResult> SubmitRevision(int id, [FromBody] SubmitRevisionDto dto)
        {
            var submission = await _context.ApplicationSubmissions
                .Include(s => s.ServiceProcedure)
                .FirstOrDefaultAsync(s => s.Id == id);

            if (submission == null) return NotFound(new { message = $"Application #{id} not found." });

            // Find the latest verification task for this application
            var task = await _context.VerificationTasks
                .Where(t => t.ApplicationId == id)
                .OrderByDescending(t => t.StageNumber)
                .ThenByDescending(t => t.Id)
                .FirstOrDefaultAsync();

            if (task != null)
            {
                task.Status = "Pending";
            }

            submission.StageStatus = "PendingReview";

            var email = User.FindFirstValue(ClaimTypes.Email) ?? User.FindFirst("email")?.Value ?? User.Identity?.Name ?? submission.UserEmail;
            var performer = !string.IsNullOrWhiteSpace(email) ? email : (!string.IsNullOrWhiteSpace(submission.CitizenNic) ? submission.CitizenNic : "Citizen");

            var audit = new AuditLog
            {
                ApplicationId = id,
                Action = "Citizen Revision Submitted",
                PerformedBy = performer,
                Timestamp = DateTime.UtcNow,
                OldValues = "Status: Revised / ActionRequired",
                NewValues = $"Clarification Notes: {dto.Notes}, Attached Document: {dto.DocumentAttachmentName ?? "None"}"
            };
            _context.AuditLogs.Add(audit);

            // If an uploaded document with this filename exists without ApplicationId or uploaded recently, link it
            if (!string.IsNullOrWhiteSpace(dto.DocumentAttachmentName))
            {
                // Browsers send "C:\fakepath\name", so strip both separator styles regardless of host OS
                var cleanName = dto.DocumentAttachmentName.Split('\\', '/')[^1];
                var recentDoc = await _context.SubmissionDocuments
                    .Where(d => d.FileName == cleanName && (d.ApplicationId == null || d.ApplicationId == id))
                    .OrderByDescending(d => d.UploadedAt)
                    .FirstOrDefaultAsync();

                if (recentDoc != null)
                {
                    recentDoc.ApplicationId = id;
                    if (string.IsNullOrWhiteSpace(recentDoc.FieldLabel))
                    {
                        recentDoc.FieldLabel = "Revised Document";
                    }
                }
            }

            await _context.SaveChangesAsync();

            return Ok(new
            {
                success = true,
                applicationId = id,
                message = "Correction submitted successfully. Your application is now back in the officer verification queue."
            });
        }

        [HttpPost("save-draft")]
        public async Task<IActionResult> SaveDraft([FromBody] SaveDraftRequest request)
        {
            var nic = User.FindFirstValue("nicNumber");
            if (string.IsNullOrWhiteSpace(nic)) return Forbid();

            var submission = await _context.ApplicationSubmissions
                .FirstOrDefaultAsync(s => s.Id == request.ApplicationId && s.CitizenNic == nic);
            if (submission == null) return NotFound("Application not found.");

            Dictionary<string, string> currentAnswers = new();
            try { currentAnswers = JsonSerializer.Deserialize<Dictionary<string, string>>(submission.FormDataJson) ?? new(); }
            catch { }

            var draftPayload = new
            {
                answers = request.Answers,
                documents = request.Documents.ToDictionary(k => k.Key, v => v.Value.ToString()),
                paymentReference = request.PaymentReference,
                paymentMethod = request.PaymentMethod,
                savedAt = DateTime.UtcNow
            };

            currentAnswers[$"[Draft Stage {request.StageNumber}]"] = JsonSerializer.Serialize(draftPayload);
            submission.FormDataJson = JsonSerializer.Serialize(currentAnswers);

            if (submission.CurrentStage <= request.StageNumber)
            {
                submission.CurrentStage = request.StageNumber;
            }

            var hasActiveTask = await _context.VerificationTasks
                .AnyAsync(t => t.ApplicationId == submission.Id && t.StageNumber == submission.CurrentStage);
            if (!hasActiveTask && submission.StageStatus != "Completed")
            {
                submission.StageStatus = "Draft";
            }

            await _context.SaveChangesAsync();

            return Ok(new { message = "Draft saved successfully", stage = request.StageNumber });
        }

        [HttpGet("{id:int}/draft")]
        public async Task<IActionResult> GetDraft(int id, [FromQuery] int stage = 1)
        {
            var nic = User.FindFirstValue("nicNumber");
            if (string.IsNullOrWhiteSpace(nic)) return Forbid();

            var submission = await _context.ApplicationSubmissions
                .FirstOrDefaultAsync(s => s.Id == id && s.CitizenNic == nic);
            if (submission == null) return NotFound("Application not found.");

            Dictionary<string, string> currentAnswers = new();
            try { currentAnswers = JsonSerializer.Deserialize<Dictionary<string, string>>(submission.FormDataJson) ?? new(); }
            catch { }

            if (currentAnswers.TryGetValue($"[Draft Stage {stage}]", out var draftJson))
            {
                try
                {
                    using var doc = JsonDocument.Parse(draftJson);
                    return Ok(new
                    {
                        hasDraft = true,
                        stage,
                        data = doc.RootElement.Clone()
                    });
                }
                catch { }
            }

            return Ok(new { hasDraft = false, stage });
        }
    }

    public class SubmitStageRequest
    {
        [Range(1, int.MaxValue, ErrorMessage = "A valid application is required.")]
        public int ApplicationId { get; set; }

        [Required(ErrorMessage = "The form is required.")]
        public Guid TemplateId { get; set; }

        [MaxLength(300, ErrorMessage = "A form can have at most 300 answers.")]
        public Dictionary<string, string> Answers { get; set; } = new();

        [MaxLength(50, ErrorMessage = "A form can have at most 50 documents.")]
        public Dictionary<string, Guid> Documents { get; set; } = new();
    }

    public class SaveDraftRequest
    {
        [Range(0, int.MaxValue, ErrorMessage = "Application id cannot be negative.")]
        public int ApplicationId { get; set; }

        [Range(0, 50, ErrorMessage = "Stage must be between 1 and 50.")]
        public int StageNumber { get; set; }

        public Guid? TemplateId { get; set; }

        [MaxLength(300, ErrorMessage = "A form can have at most 300 answers.")]
        public Dictionary<string, string> Answers { get; set; } = new();

        [MaxLength(50, ErrorMessage = "A form can have at most 50 documents.")]
        public Dictionary<string, Guid> Documents { get; set; } = new();

        [MaxLength(200, ErrorMessage = "Payment reference must be at most 200 characters.")]
        public string? PaymentReference { get; set; }

        [MaxLength(50, ErrorMessage = "Payment method must be at most 50 characters.")]
        public string? PaymentMethod { get; set; }
    }
}
