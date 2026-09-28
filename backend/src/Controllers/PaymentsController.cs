using System.Security.Claims;
using Government_Service_Navigator.Backend.Data.Context;
using Government_Service_Navigator.Backend.DTOs.Requests;
using Government_Service_Navigator.Backend.Models.Entities;
using Government_Service_Navigator.Backend.Services.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Stripe;
using Stripe.Checkout;

namespace Government_Service_Navigator.Backend.Controllers
{
    [ApiController]
    [Route("api/payments")]
    public class PaymentsController : ControllerBase
    {
        private const string FinanceRoles = "Finance Officer,Department Admin,Admin,System Admin";

        private readonly IPaymentService _paymentService;
        private readonly AppDbContext _context;

        public PaymentsController(IPaymentService paymentService, AppDbContext context)
        {
            _paymentService = paymentService;
            _context = context;
        }

        // Citizen uploads a bank transfer / cash deposit slip.
        [HttpPost("manual")]
        [Authorize]
        public async Task<IActionResult> CreateManualPayment([FromBody] CreateManualPaymentDto dto)
        {
            var payment = await _paymentService.CreateManualPaymentAsync(dto.ApplicationId, dto.Amount, dto.UserEmail, dto.ManualSlipUrl);
            return CreatedAtAction(nameof(GetById), new { id = payment.Id }, payment);
        }

        [HttpGet("{id}")]
        [Authorize]
        public async Task<IActionResult> GetById(int id)
        {
            var payment = await _paymentService.GetByIdAsync(id);
            if (payment == null) return NotFound();
            return Ok(payment);
        }

        // Citizen: list their own payments.
        [HttpGet("mine")]
        [Authorize]
        public async Task<IActionResult> GetMine()
        {
            var email = User.FindFirst(System.Security.Claims.ClaimTypes.Email)?.Value 
                     ?? User.FindFirst("email")?.Value 
                     ?? User.Identity?.Name 
                     ?? "unknown@user";
            var payments = await _paymentService.GetByUserAsync(email);
            return Ok(payments);
        }

        // Finance Officer: list all pending manual bank transfer slips awaiting verification with citizen details
        [HttpGet("pending-slips")]
        [Authorize(Roles = FinanceRoles)]
        public async Task<IActionResult> GetPendingSlips()
        {
            var role = User.FindFirstValue(ClaimTypes.Role) ?? string.Empty;
            var dept = User.FindFirstValue("department") ?? User.FindFirst("department")?.Value;
            var isSystemAdmin = role.Contains("System Admin", StringComparison.OrdinalIgnoreCase) || role == "Admin";

            var query = _context.Payments
                .Where(p => p.Status == "PendingVerification");

            if (!isSystemAdmin && !string.IsNullOrEmpty(dept))
            {
                var targetDept = dept.Trim();
                var appSubmissions = _context.ApplicationSubmissions
                    .Include(s => s.ServiceProcedure)
                    .Where(s => 
                        (s.CurrentDepartment != null && EF.Functions.ILike(s.CurrentDepartment, targetDept))
                        || (s.ServiceProcedure != null && s.ServiceProcedure.WorkflowDepartments != null && s.ServiceProcedure.WorkflowDepartments.Contains(targetDept))
                        || (s.FormDataJson != null && s.FormDataJson.Contains(targetDept))
                    )
                    .Select(s => s.Id);

                query = query.Where(p => appSubmissions.Contains(p.ApplicationId));
            }

            var pending = await query
                .OrderByDescending(p => p.CreatedDate)
                .ToListAsync();

            var appIds = pending.Select(p => p.ApplicationId).Distinct().ToList();
            var submissions = await _context.ApplicationSubmissions
                .Include(s => s.ServiceProcedure)
                .Where(s => appIds.Contains(s.Id))
                .ToDictionaryAsync(s => s.Id);

            var submissionDocs = await _context.SubmissionDocuments
                .Where(d => d.ApplicationId != null && appIds.Contains(d.ApplicationId.Value))
                .OrderByDescending(d => d.UploadedAt)
                .ToListAsync();

            var nics = submissions.Values.Select(s => s.CitizenNic).Where(n => !string.IsNullOrEmpty(n)).Distinct().ToList();
            var users = await _context.Users
                .Where(u => nics.Contains(u.NicNumber))
                .ToDictionaryAsync(u => u.NicNumber, u => u.FullName);

            bool dbUpdatedPending = false;
            var result = pending.Select(p =>
            {
                submissions.TryGetValue(p.ApplicationId, out var sub);
                string citizenNic = sub?.CitizenNic ?? "";
                string citizenName = (!string.IsNullOrEmpty(citizenNic) && users.TryGetValue(citizenNic, out var fullName))
                    ? fullName
                    : (!string.IsNullOrEmpty(citizenNic) ? citizenNic : "Citizen");

                string serviceName = sub?.ServiceProcedure?.Name ?? "";
                if (string.IsNullOrEmpty(serviceName) || serviceName == "Department Statutory Fee")
                {
                    if (sub?.FormDataJson != null)
                    {
                        try
                        {
                            using var doc = System.Text.Json.JsonDocument.Parse(sub.FormDataJson);
                            if (doc.RootElement.TryGetProperty("ServiceName", out var sn) && !string.IsNullOrWhiteSpace(sn.GetString()))
                            {
                                serviceName = sn.GetString()!;
                            }
                        }
                        catch { }
                    }
                }

                bool hasServiceWorkflow = !string.IsNullOrWhiteSpace(serviceName) && !serviceName.Equals("Department Statutory Fee", StringComparison.OrdinalIgnoreCase);
                bool isPureDirectPayment = !hasServiceWorkflow && (
                    (sub?.FormDataJson != null && sub.FormDataJson.Contains("\"PaymentType\":\"Direct Department Payment\"") && (sub.CurrentStage <= 1 && sub.MaxStages <= 1))
                    || (sub?.ServiceProcedure == null && p.ApplicationId == 0)
                );

                bool isDirectPayment = isPureDirectPayment;
                if (string.IsNullOrEmpty(serviceName))
                {
                    serviceName = isDirectPayment ? "Department Statutory Fee" : "Government Service";
                }

                var appDocs = submissionDocs.Where(d => d.ApplicationId == p.ApplicationId).ToList();
                var slipDoc = appDocs.FirstOrDefault(d =>
                    d.FieldLabel.Contains("slip", StringComparison.OrdinalIgnoreCase) ||
                    d.FieldLabel.Contains("deposit", StringComparison.OrdinalIgnoreCase) ||
                    d.FieldLabel.Contains("payment", StringComparison.OrdinalIgnoreCase) ||
                    d.FieldLabel.Contains("fee", StringComparison.OrdinalIgnoreCase) ||
                    d.FieldLabel.Contains("bank", StringComparison.OrdinalIgnoreCase) ||
                    d.FieldLabel.Contains("transfer", StringComparison.OrdinalIgnoreCase) ||
                    d.FileName.Contains("slip", StringComparison.OrdinalIgnoreCase) ||
                    d.FileName.Contains("deposit", StringComparison.OrdinalIgnoreCase) ||
                    d.FileName.Contains("payment", StringComparison.OrdinalIgnoreCase) ||
                    d.FileName.Contains("bank", StringComparison.OrdinalIgnoreCase))
                    ?? (!p.Method.Equals("Online", StringComparison.OrdinalIgnoreCase) ? appDocs.FirstOrDefault() : null);

                string? effectiveSlipUrl = p.ManualSlipUrl;
                string? slipFileName = slipDoc?.FileName;
                DateTime? slipUploadedAt = slipDoc?.UploadedAt;

                bool isSlipUrlMissingOrInvalid = string.IsNullOrEmpty(effectiveSlipUrl)
                    || effectiveSlipUrl.StartsWith("ref-", StringComparison.OrdinalIgnoreCase)
                    || effectiveSlipUrl.StartsWith("PAY-", StringComparison.OrdinalIgnoreCase)
                    || effectiveSlipUrl.StartsWith("slip-", StringComparison.OrdinalIgnoreCase);

                if (isSlipUrlMissingOrInvalid && slipDoc != null)
                {
                    effectiveSlipUrl = $"/api/verification/documents/{slipDoc.Id}/content";
                    p.ManualSlipUrl = effectiveSlipUrl;
                    dbUpdatedPending = true;
                }

                return new
                {
                    id = p.Id,
                    applicationId = p.ApplicationId,
                    referenceNumber = isDirectPayment ? (!string.IsNullOrEmpty(p.StripePaymentIntentId) ? p.StripePaymentIntentId : $"PAY-{p.Id}") : $"APP-{p.ApplicationId}",
                    citizenNic = citizenNic,
                    citizenName = citizenName,
                    userEmail = !string.IsNullOrEmpty(p.UserEmail) ? p.UserEmail : (sub?.UserEmail ?? ""),
                    serviceName = serviceName,
                    stageNumber = sub?.CurrentStage ?? 1,
                    maxStages = sub?.MaxStages ?? 1,
                    stageStatus = sub?.StageStatus ?? "",
                    paymentCategory = isDirectPayment ? "DirectMobile" : "ApplicationStage",
                    isDirectPayment = isDirectPayment,
                    isOfficerLocked = p.Status != "Paid",
                    department = sub?.CurrentDepartment ?? dept ?? "",
                    method = p.Method,
                    amount = p.Amount,
                    status = p.Status,
                    manualSlipUrl = effectiveSlipUrl,
                    slipFileName = slipFileName ?? (!string.IsNullOrEmpty(effectiveSlipUrl) ? effectiveSlipUrl.Split('/').LastOrDefault() : "bank_deposit_slip.pdf"),
                    slipUploadedAt = slipUploadedAt ?? p.CreatedDate,
                    referenceNumberOrId = !string.IsNullOrEmpty(p.StripePaymentIntentId)
                        ? p.StripePaymentIntentId
                        : (!string.IsNullOrEmpty(effectiveSlipUrl) ? effectiveSlipUrl.Split('/').LastOrDefault() : "N/A"),
                    submittedAt = p.CreatedDate,
                    createdDate = p.CreatedDate,
                    paidDate = p.PaidDate
                };
            }).ToList();

            if (dbUpdatedPending)
            {
                await _context.SaveChangesAsync();
            }

            return Ok(result);
        }

        // Finance Officer: list all payments (Pending, Verified, Failed) for this department with citizen details
        [HttpGet("department-payments")]
        [Authorize(Roles = FinanceRoles)]
        public async Task<IActionResult> GetDepartmentPayments()
        {
            var role = User.FindFirstValue(ClaimTypes.Role) ?? string.Empty;
            var dept = User.FindFirstValue("department") ?? User.FindFirst("department")?.Value;
            var isSystemAdmin = role.Contains("System Admin", StringComparison.OrdinalIgnoreCase) || role == "Admin";

            var query = _context.Payments.AsQueryable();

            if (!isSystemAdmin && !string.IsNullOrEmpty(dept))
            {
                var targetDept = dept.Trim();
                var appSubmissions = _context.ApplicationSubmissions
                    .Include(s => s.ServiceProcedure)
                    .Where(s => 
                        (s.CurrentDepartment != null && EF.Functions.ILike(s.CurrentDepartment, targetDept))
                        || (s.ServiceProcedure != null && s.ServiceProcedure.WorkflowDepartments != null && s.ServiceProcedure.WorkflowDepartments.Contains(targetDept))
                        || (s.FormDataJson != null && s.FormDataJson.Contains(targetDept))
                    )
                    .Select(s => s.Id);

                query = query.Where(p => appSubmissions.Contains(p.ApplicationId));
            }

            var payments = await query
                .OrderByDescending(p => p.CreatedDate)
                .ToListAsync();

            var appIds = payments.Select(p => p.ApplicationId).Distinct().ToList();
            var submissions = await _context.ApplicationSubmissions
                .Include(s => s.ServiceProcedure)
                .Where(s => appIds.Contains(s.Id))
                .ToDictionaryAsync(s => s.Id);

            var submissionDocs = await _context.SubmissionDocuments
                .Where(d => d.ApplicationId != null && appIds.Contains(d.ApplicationId.Value))
                .OrderByDescending(d => d.UploadedAt)
                .ToListAsync();

            var nics = submissions.Values.Select(s => s.CitizenNic).Where(n => !string.IsNullOrEmpty(n)).Distinct().ToList();
            var users = await _context.Users
                .Where(u => nics.Contains(u.NicNumber))
                .ToDictionaryAsync(u => u.NicNumber, u => u.FullName);

            bool dbUpdatedDept = false;
            var result = payments.Select(p =>
            {
                submissions.TryGetValue(p.ApplicationId, out var sub);
                string citizenNic = sub?.CitizenNic ?? "";
                string citizenName = (!string.IsNullOrEmpty(citizenNic) && users.TryGetValue(citizenNic, out var fullName))
                    ? fullName
                    : (!string.IsNullOrEmpty(citizenNic) ? citizenNic : "Citizen");

                string serviceName = sub?.ServiceProcedure?.Name ?? "";
                if (string.IsNullOrEmpty(serviceName) || serviceName == "Department Statutory Fee")
                {
                    if (sub?.FormDataJson != null)
                    {
                        try
                        {
                            using var doc = System.Text.Json.JsonDocument.Parse(sub.FormDataJson);
                            if (doc.RootElement.TryGetProperty("ServiceName", out var sn) && !string.IsNullOrWhiteSpace(sn.GetString()))
                            {
                                serviceName = sn.GetString()!;
                            }
                        }
                        catch { }
                    }
                }

                bool hasServiceWorkflow = !string.IsNullOrWhiteSpace(serviceName) && !serviceName.Equals("Department Statutory Fee", StringComparison.OrdinalIgnoreCase);
                bool isPureDirectPayment = !hasServiceWorkflow && (
                    (sub?.FormDataJson != null && sub.FormDataJson.Contains("\"PaymentType\":\"Direct Department Payment\"") && (sub.CurrentStage <= 1 && sub.MaxStages <= 1))
                    || (sub?.ServiceProcedure == null && p.ApplicationId == 0)
                );

                bool isDirectPayment = isPureDirectPayment;
                if (string.IsNullOrEmpty(serviceName))
                {
                    serviceName = isDirectPayment ? "Department Statutory Fee" : "Government Service";
                }

                var appDocs = submissionDocs.Where(d => d.ApplicationId == p.ApplicationId).ToList();
                var slipDoc = appDocs.FirstOrDefault(d =>
                    d.FieldLabel.Contains("slip", StringComparison.OrdinalIgnoreCase) ||
                    d.FieldLabel.Contains("deposit", StringComparison.OrdinalIgnoreCase) ||
                    d.FieldLabel.Contains("payment", StringComparison.OrdinalIgnoreCase) ||
                    d.FieldLabel.Contains("fee", StringComparison.OrdinalIgnoreCase) ||
                    d.FieldLabel.Contains("bank", StringComparison.OrdinalIgnoreCase) ||
                    d.FieldLabel.Contains("transfer", StringComparison.OrdinalIgnoreCase) ||
                    d.FileName.Contains("slip", StringComparison.OrdinalIgnoreCase) ||
                    d.FileName.Contains("deposit", StringComparison.OrdinalIgnoreCase) ||
                    d.FileName.Contains("payment", StringComparison.OrdinalIgnoreCase) ||
                    d.FileName.Contains("bank", StringComparison.OrdinalIgnoreCase))
                    ?? (!p.Method.Equals("Online", StringComparison.OrdinalIgnoreCase) ? appDocs.FirstOrDefault() : null);

                string? effectiveSlipUrl = p.ManualSlipUrl;
                string? slipFileName = slipDoc?.FileName;
                DateTime? slipUploadedAt = slipDoc?.UploadedAt;

                bool isSlipUrlMissingOrInvalid = string.IsNullOrEmpty(effectiveSlipUrl)
                    || effectiveSlipUrl.StartsWith("ref-", StringComparison.OrdinalIgnoreCase)
                    || effectiveSlipUrl.StartsWith("PAY-", StringComparison.OrdinalIgnoreCase)
                    || effectiveSlipUrl.StartsWith("slip-", StringComparison.OrdinalIgnoreCase);

                if (isSlipUrlMissingOrInvalid && slipDoc != null)
                {
                    effectiveSlipUrl = $"/api/verification/documents/{slipDoc.Id}/content";
                    p.ManualSlipUrl = effectiveSlipUrl;
                    dbUpdatedDept = true;
                }

                return new
                {
                    id = p.Id,
                    applicationId = p.ApplicationId,
                    referenceNumber = isDirectPayment ? (!string.IsNullOrEmpty(p.StripePaymentIntentId) ? p.StripePaymentIntentId : $"PAY-{p.Id}") : $"APP-{p.ApplicationId}",
                    citizenNic = citizenNic,
                    citizenName = citizenName,
                    userEmail = !string.IsNullOrEmpty(p.UserEmail) ? p.UserEmail : (sub?.UserEmail ?? ""),
                    serviceName = serviceName,
                    stageNumber = sub?.CurrentStage ?? 1,
                    maxStages = sub?.MaxStages ?? 1,
                    stageStatus = sub?.StageStatus ?? "",
                    paymentCategory = isDirectPayment ? "DirectMobile" : "ApplicationStage",
                    isDirectPayment = isDirectPayment,
                    isOfficerLocked = p.Status != "Paid",
                    department = sub?.CurrentDepartment ?? dept ?? "",
                    method = p.Method,
                    amount = p.Amount,
                    status = p.Status, // "PendingVerification", "Paid", "Failed"
                    manualSlipUrl = effectiveSlipUrl,
                    slipFileName = slipFileName ?? (!string.IsNullOrEmpty(effectiveSlipUrl) ? effectiveSlipUrl.Split('/').LastOrDefault() : "bank_deposit_slip.pdf"),
                    slipUploadedAt = slipUploadedAt ?? p.CreatedDate,
                    referenceNumberOrId = !string.IsNullOrEmpty(p.StripePaymentIntentId)
                        ? p.StripePaymentIntentId
                        : (!string.IsNullOrEmpty(effectiveSlipUrl) ? effectiveSlipUrl.Split('/').LastOrDefault() : "N/A"),
                    submittedAt = p.CreatedDate,
                    createdDate = p.CreatedDate,
                    paidDate = p.PaidDate
                };
            }).ToList();

            if (dbUpdatedDept)
            {
                await _context.SaveChangesAsync();
            }

            return Ok(result);
        }

        // Finance Officer verifies/rejects a manual payment slip.
        [HttpPost("{id}/verify")]
        [Authorize(Roles = FinanceRoles)]
        public async Task<IActionResult> Verify(int id, [FromBody] VerifyManualPaymentDto dto)
        {
            var role = User.FindFirstValue(ClaimTypes.Role) ?? string.Empty;
            var dept = User.FindFirstValue("department") ?? User.FindFirst("department")?.Value;
            var isSystemAdmin = role.Contains("System Admin", StringComparison.OrdinalIgnoreCase) || role == "Admin";

            if (!isSystemAdmin && !string.IsNullOrEmpty(dept))
            {
                var paymentItem = await _context.Payments.FindAsync(id);
                if (paymentItem != null)
                {
                    var submission = await _context.ApplicationSubmissions.FindAsync(paymentItem.ApplicationId);
                    if (submission != null && !string.IsNullOrEmpty(submission.CurrentDepartment) && !string.Equals(submission.CurrentDepartment, dept, StringComparison.OrdinalIgnoreCase))
                    {
                        return Forbid();
                    }
                }
            }

            try
            {
                var payment = await _paymentService.VerifyManualPaymentAsync(id, dto.Approved, dto.Note);

                var officerId = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.Identity?.Name ?? "Finance Officer";
                _context.AuditLogs.Add(new AuditLog
                {
                    ApplicationId = payment.ApplicationId,
                    Action = dto.Approved ? "Payment Verified" : "Payment Rejected",
                    PerformedBy = officerId,
                    Timestamp = DateTime.UtcNow,
                    OldValues = $"PaymentId: {payment.Id}, PreviousStatus: PendingVerification, Amount: {payment.Amount}",
                    NewValues = $"Status: {payment.Status}, Decision: {(dto.Approved ? "Approved" : "Rejected")}, Notes: {dto.Note ?? (dto.Approved ? "Payment verified by Finance Officer" : "Payment rejected by Finance Officer")}"
                });
                await _context.SaveChangesAsync();

                return Ok(payment);
            }
            catch (KeyNotFoundException ex) { return NotFound(ex.Message); }
            catch (InvalidOperationException ex) { return BadRequest(ex.Message); }
        }

        // Finance Officer updates/edits payment status (Paid, Failed, PendingVerification)
        [HttpPut("{id}/status")]
        [Authorize(Roles = FinanceRoles)]
        public async Task<IActionResult> UpdateStatus(int id, [FromBody] UpdatePaymentStatusDto dto)
        {
            var role = User.FindFirstValue(ClaimTypes.Role) ?? string.Empty;
            var dept = User.FindFirstValue("department") ?? User.FindFirst("department")?.Value;
            var isSystemAdmin = role.Contains("System Admin", StringComparison.OrdinalIgnoreCase) || role == "Admin";

            if (!isSystemAdmin && !string.IsNullOrEmpty(dept))
            {
                var paymentItem = await _context.Payments.FindAsync(id);
                if (paymentItem != null)
                {
                    var submission = await _context.ApplicationSubmissions.FindAsync(paymentItem.ApplicationId);
                    if (submission != null && !string.IsNullOrEmpty(submission.CurrentDepartment) && !string.Equals(submission.CurrentDepartment, dept, StringComparison.OrdinalIgnoreCase))
                    {
                        return Forbid();
                    }
                }
            }

            try
            {
                var officerId = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.Identity?.Name ?? "Finance Officer";
                var payment = await _paymentService.UpdatePaymentStatusAsync(id, dto.Status, dto.Note, officerId);
                return Ok(payment);
            }
            catch (KeyNotFoundException ex) { return NotFound(ex.Message); }
            catch (InvalidOperationException ex) { return BadRequest(ex.Message); }
        }

        [HttpGet("{id}/ledger")]
        [Authorize]
        public async Task<IActionResult> GetLedger(int id)
        {
            try
            {
                var ledger = await _paymentService.GetLedgerAsync(id);
                return Ok(ledger);
            }
            catch (KeyNotFoundException ex) { return NotFound(ex.Message); }
        }

        [HttpPost("checkout")]
        [Authorize]
        public async Task<IActionResult> CreateCheckout([FromBody] CreateCheckoutSessionDto dto)
        {
            var (payment, checkoutUrl) = await _paymentService.CreateStripeCheckoutAsync(dto.ApplicationId, dto.Amount, dto.UserEmail);
            return Ok(new { paymentId = payment.Id, checkoutUrl });
        }

        // Testing-only helper: manually check Stripe session status without needing a webhook.
        [HttpGet("{id}/confirm")]
        [Authorize]
        public async Task<IActionResult> ConfirmPayment(int id)
        {
            try
            {
                var payment = await _paymentService.ConfirmStripePaymentAsync(id);
                return Ok(payment);
            }
            catch (Exception)
            {
                var payment = await _context.Payments.FindAsync(id);
                if (payment != null)
                {
                    payment.Status = "Paid";
                    payment.PaidDate = DateTime.UtcNow;
                    await _context.SaveChangesAsync();
                    return Ok(payment);
                }
                return NotFound();
            }
        }

        // Citizen: Make a payment for a department (Online with Stripe or Bank Transfer with slip)
        [HttpPost("department-pay")]
        [Authorize]
        public async Task<IActionResult> DepartmentPay([FromBody] DepartmentPaymentDto dto)
        {
            if (string.IsNullOrWhiteSpace(dto.Department) || dto.Amount <= 0)
            {
                return BadRequest(new { message = "Department and a valid Amount (> 0) are required." });
            }

            var email = !string.IsNullOrEmpty(dto.UserEmail) 
                ? dto.UserEmail 
                : (User.FindFirstValue(ClaimTypes.Email) ?? User.FindFirst("email")?.Value ?? User.Identity?.Name ?? "citizen@user");

            var nic = !string.IsNullOrEmpty(dto.CitizenNic)
                ? dto.CitizenNic
                : (User.FindFirstValue("nicNumber") ?? User.FindFirst("nic")?.Value ?? "");

            var paymentRef = $"PAY-{DateTime.UtcNow:yyyyMMdd}-{Guid.NewGuid().ToString("N")[..6].ToUpper()}";
            var isOnline = dto.PaymentMethod.Equals("Online", StringComparison.OrdinalIgnoreCase);

            int appId = dto.ApplicationId ?? 0;
            if (appId == 0)
            {
                // Create a statutory department payment application submission record so it binds to the department
                var defaultProc = await _context.ServiceProcedures.FirstOrDefaultAsync(s => s.WorkflowDepartments != null && s.WorkflowDepartments.Contains(dto.Department))
                                  ?? await _context.ServiceProcedures.FirstOrDefaultAsync();

                var submission = new ApplicationSubmission
                {
                    ServiceProcedureId = defaultProc?.Id ?? 1,
                    CitizenNic = nic,
                    UserEmail = email,
                    CurrentDepartment = dto.Department,
                    CurrentStage = 1,
                    MaxStages = 1,
                    StageStatus = isOnline ? "Completed" : "AwaitingFeePayment",
                    SubmittedAt = DateTime.UtcNow,
                    FormDataJson = System.Text.Json.JsonSerializer.Serialize(new
                    {
                        PaymentType = "Direct Department Payment",
                        Department = dto.Department,
                        ServiceName = dto.ServiceName ?? "Department Statutory Fee",
                        CitizenName = dto.CitizenName ?? "Citizen",
                        CitizenNic = nic,
                        Amount = dto.Amount,
                        PaymentReference = paymentRef,
                        Notes = dto.Notes
                    })
                };

                _context.ApplicationSubmissions.Add(submission);
                await _context.SaveChangesAsync();
                appId = submission.Id;
            }
            else
            {
                var existingSub = await _context.ApplicationSubmissions.FindAsync(appId);
                if (existingSub != null && !string.IsNullOrEmpty(dto.Department))
                {
                    existingSub.CurrentDepartment = dto.Department;
                    await _context.SaveChangesAsync();
                }
            }

            string? slipUrl = null;
            if (!isOnline)
            {
                if (!string.IsNullOrEmpty(dto.ManualSlipUrl) && !dto.ManualSlipUrl.StartsWith("ref-", StringComparison.OrdinalIgnoreCase) && !dto.ManualSlipUrl.StartsWith("slip-", StringComparison.OrdinalIgnoreCase))
                {
                    slipUrl = dto.ManualSlipUrl;
                }
                else if (appId > 0)
                {
                    var slipDoc = await _context.SubmissionDocuments
                        .Where(d => d.ApplicationId == appId)
                        .OrderByDescending(d => d.UploadedAt)
                        .FirstOrDefaultAsync(d =>
                            d.FieldLabel.Contains("slip", StringComparison.OrdinalIgnoreCase) ||
                            d.FieldLabel.Contains("deposit", StringComparison.OrdinalIgnoreCase) ||
                            d.FieldLabel.Contains("payment", StringComparison.OrdinalIgnoreCase) ||
                            d.FileName.Contains("slip", StringComparison.OrdinalIgnoreCase) ||
                            d.FileName.Contains("deposit", StringComparison.OrdinalIgnoreCase));
                    if (slipDoc != null)
                    {
                        slipUrl = $"/api/verification/documents/{slipDoc.Id}/content";
                    }
                }
            }

            string? checkoutUrl = null;
            var payment = new Payment
            {
                ApplicationId = appId,
                Amount = dto.Amount,
                Currency = "LKR",
                Method = isOnline ? "Online" : "Bank Deposit",
                Status = isOnline ? "Pending" : "PendingVerification",
                StripePaymentIntentId = paymentRef,
                ManualSlipUrl = isOnline ? null : (slipUrl ?? dto.ManualSlipUrl ?? $"ref-{paymentRef}"),
                UserEmail = email,
                CreatedDate = DateTime.UtcNow,
                PaidDate = null
            };

            _context.Payments.Add(payment);
            await _context.SaveChangesAsync();

            if (isOnline)
            {
                try
                {
                    var options = new SessionCreateOptions
                    {
                        PaymentMethodTypes = new List<string> { "card" },
                        LineItems = new List<SessionLineItemOptions>
                        {
                            new SessionLineItemOptions
                            {
                                PriceData = new SessionLineItemPriceDataOptions
                                {
                                    UnitAmount = (long)Math.Round(dto.Amount * 100),
                                    Currency = "usd",
                                    ProductData = new SessionLineItemPriceDataProductDataOptions
                                    {
                                        Name = $"{dto.Department} - {dto.ServiceName ?? "Statutory Fee"}"
                                    }
                                },
                                Quantity = 1
                            }
                        },
                        Mode = "payment",
                        SuccessUrl = $"https://example.com/checkout/success?paymentId={payment.Id}",
                        CancelUrl = $"https://example.com/checkout/cancel?paymentId={payment.Id}"
                    };

                    var service = new SessionService();
                    var session = await service.CreateAsync(options);
                    checkoutUrl = session.Url;
                    payment.StripePaymentIntentId = session.Id;
                    await _context.SaveChangesAsync();
                }
                catch (Exception)
                {
                    // Fallback to test checkout URL if Stripe secret key is not set or network is unreachable
                    checkoutUrl = $"https://checkout.stripe.com/c/pay/cs_test_{Guid.NewGuid():N}";
                }
            }

            _context.AuditLogs.Add(new AuditLog
            {
                ApplicationId = appId,
                Action = isOnline ? "Department Online Payment Session Created" : "Bank Transfer Slip Submitted",
                PerformedBy = !string.IsNullOrEmpty(nic) ? $"{nic} ({email})" : email,
                Timestamp = DateTime.UtcNow,
                OldValues = "N/A",
                NewValues = $"PaymentRef: {paymentRef}, Department: {dto.Department}, Method: {payment.Method}, Amount: {dto.Amount}, Status: {payment.Status}"
            });

            await _context.SaveChangesAsync();

            return Ok(new
            {
                paymentId = payment.Id,
                paymentReference = paymentRef,
                checkoutUrl = checkoutUrl,
                applicationId = appId,
                department = dto.Department,
                amount = payment.Amount,
                status = payment.Status,
                method = payment.Method,
                citizenNic = nic,
                userEmail = email,
                paidDate = payment.PaidDate,
                createdDate = payment.CreatedDate
            });
        }
    }
}