using Government_Service_Navigator.Backend.Data.Context;
using Government_Service_Navigator.Backend.DTOs.Responses;
using Government_Service_Navigator.Backend.Models.Entities;
using Government_Service_Navigator.Backend.Services.Interfaces;
using Microsoft.EntityFrameworkCore;
using Stripe;
using Stripe.Checkout;

namespace Government_Service_Navigator.Backend.Services
{
    public class PaymentService : IPaymentService
    {
    private readonly AppDbContext _context;
    private readonly INotificationService _notificationService;

        public PaymentService(AppDbContext context, INotificationService notificationService)
        {
            _context = context;
            _notificationService = notificationService;
        }

        public async Task<Payment> CreateManualPaymentAsync(int applicationId, decimal amount, string userEmail, string slipUrl)
        {
            var payment = new Payment
            {
                ApplicationId = applicationId,
                Amount = amount,
                Currency = "LKR",
                Method = "Manual",
                Status = "PendingVerification",
                ManualSlipUrl = slipUrl,
                UserEmail = userEmail,
                CreatedDate = DateTime.UtcNow
            };

            _context.Payments.Add(payment);
            await _context.SaveChangesAsync();

            await _notificationService.NotifyPaymentStatusAsync(userEmail, payment.Id, "PendingVerification");


            return payment;
        }

        public async Task<Payment?> GetByIdAsync(int id)
        {
            return await _context.Payments
                .Include(p => p.RefundRequests)
                .FirstOrDefaultAsync(p => p.Id == id);
        }

        public async Task<List<Payment>> GetByUserAsync(string email)
        {
            if (string.IsNullOrWhiteSpace(email)) return new List<Payment>();
            var normalizedEmail = email.Trim().ToLower();

            return await _context.Payments
                .Where(p => p.UserEmail.ToLower() == normalizedEmail)
                .OrderByDescending(p => p.CreatedDate)
                .ToListAsync();
        }

        public async Task<Payment> VerifyManualPaymentAsync(int id, bool approved, string? note)
        {
            var payment = await _context.Payments.FindAsync(id);

            if (payment == null)
            {
                throw new KeyNotFoundException($"Payment {id} not found.");
            }

            var oldStatus = payment.Status;

            if (approved)
            {
                payment.Status = "Paid";
                payment.PaidDate = DateTime.UtcNow;
                await ApplyPaidToSubmissionAsync(payment);

                if (payment.ApplicationId > 0)
                {
                    var duplicatePending = await _context.Payments
                        .Where(p => p.ApplicationId == payment.ApplicationId && p.Id != payment.Id && p.Status == "PendingVerification")
                        .ToListAsync();
                    if (duplicatePending.Count > 0)
                    {
                        _context.Payments.RemoveRange(duplicatePending);
                    }
                }
            }
            else
            {
                payment.Status = "Failed";
            }

            await _context.SaveChangesAsync();

            await _notificationService.NotifyPaymentStatusAsync(payment.UserEmail, payment.Id, payment.Status);

            _context.AuditLogs.Add(new AuditLog
            {
                ApplicationId = payment.ApplicationId,
                Action = "PaymentVerified",
                PerformedBy = "officer",
                Timestamp = DateTime.UtcNow,
                OldValues = $"Status={oldStatus}",
                NewValues = $"PaymentId={payment.Id}, Status={payment.Status}"
            });
            await _context.SaveChangesAsync();

            return payment;
        }

        public async Task<Payment> UpdatePaymentStatusAsync(int id, string status, string? note, string officerId)
        {
            var payment = await _context.Payments.FindAsync(id);
            if (payment == null)
            {
                throw new KeyNotFoundException($"Payment {id} not found.");
            }

            var oldStatus = payment.Status;
            string normalized = status.Trim().ToLowerInvariant() switch
            {
                "paid" or "verified" => "Paid",
                "failed" or "rejected" => "Failed",
                "pendingverification" or "pending" => "PendingVerification",
                _ => status
            };

            payment.Status = normalized;
            if (normalized == "Paid")
            {
                payment.PaidDate ??= DateTime.UtcNow;
                await ApplyPaidToSubmissionAsync(payment);

                if (payment.ApplicationId > 0)
                {
                    var duplicatePending = await _context.Payments
                        .Where(p => p.ApplicationId == payment.ApplicationId && p.Id != payment.Id && p.Status == "PendingVerification")
                        .ToListAsync();
                    if (duplicatePending.Count > 0)
                    {
                        _context.Payments.RemoveRange(duplicatePending);
                    }
                }
            }
            else if (normalized == "PendingVerification")
            {
                payment.PaidDate = null;
            }

            await _context.SaveChangesAsync();

            await _notificationService.NotifyPaymentStatusAsync(payment.UserEmail, payment.Id, payment.Status);

            _context.AuditLogs.Add(new AuditLog
            {
                ApplicationId = payment.ApplicationId,
                Action = $"Payment Status Updated: {normalized}",
                PerformedBy = officerId,
                Timestamp = DateTime.UtcNow,
                OldValues = $"PaymentId={payment.Id}, Status={oldStatus}",
                NewValues = $"Status={payment.Status}, Note={note ?? "Status updated by officer"}"
            });
            await _context.SaveChangesAsync();

            return payment;
        }
        public async Task<PaymentLedgerDto> GetLedgerAsync(int id)
        {
            var payment = await _context.Payments
                .Include(p => p.RefundRequests)
                .FirstOrDefaultAsync(p => p.Id == id);

            if (payment == null)
            {
                throw new KeyNotFoundException($"Payment {id} not found.");
            }

            var entries = new List<LedgerEntryDto>
            {
                new LedgerEntryDto
                {
                    Type = "Payment",
                    Amount = payment.Amount,
                    Date = payment.PaidDate ?? payment.CreatedDate,
                    Description = $"Payment via {payment.Method}"
                }
            };

            decimal totalRefunded = 0;

            if (payment.RefundRequests != null)
            {
                foreach (var refund in payment.RefundRequests.Where(r => r.Status == RefundStatus.Completed))
                {
                    entries.Add(new LedgerEntryDto
                    {
                        Type = "Refund",
                        Amount = -refund.RefundAmount,
                        Date = refund.CompletedDate ?? refund.RequestedDate,
                        Description = $"Refund: {refund.Reason}"
                    });

                    totalRefunded += refund.RefundAmount;
                }
            }

            return new PaymentLedgerDto
            {
                PaymentId = payment.Id,
                OriginalAmount = payment.Amount,
                TotalRefunded = totalRefunded,
                RunningBalance = payment.Amount - totalRefunded,
                Status = payment.Status,
                Entries = entries.OrderBy(e => e.Date).ToList()
            };
        }

        public async Task<(Payment payment, string checkoutUrl)> CreateStripeCheckoutAsync(int applicationId, decimal amount, string userEmail)
        {
            var payment = new Payment
            {
                ApplicationId = applicationId,
                Amount = amount,
                Currency = "LKR",
                Method = "Online",
                Status = "Pending",
                UserEmail = userEmail,
                CreatedDate = DateTime.UtcNow
            };

            _context.Payments.Add(payment);
            await _context.SaveChangesAsync();

            var submission = await _context.ApplicationSubmissions
                .Include(s => s.ServiceProcedure)
                .FirstOrDefaultAsync(s => s.Id == applicationId);
            var productName = submission != null
                ? $"{ResolveServiceName(submission)} - Stage {submission.CurrentStage} (APP-{applicationId})"
                : $"Application #{applicationId} Fee";

            var checkoutUrl = await OpenStripeCheckoutAsync(payment, productName);
            return (payment, checkoutUrl);
        }

        public async Task<string> OpenStripeCheckoutAsync(Payment payment, string productName)
        {
            var options = new SessionCreateOptions
            {
                PaymentMethodTypes = new List<string> { "card" },
                // Pre-fills (and locks) the email field on the Stripe page with the signed-in user's email
                CustomerEmail = IsDeliverableEmail(payment.UserEmail) ? payment.UserEmail : null,
                ClientReferenceId = payment.Id.ToString(),
                LineItems = new List<SessionLineItemOptions>
                {
                    new SessionLineItemOptions
                    {
                        PriceData = new SessionLineItemPriceDataOptions
                        {
                            // LKR is a two-decimal currency in Stripe, so the amount is sent in cents
                            UnitAmount = (long)Math.Round(payment.Amount * 100),
                            Currency = "lkr",
                            ProductData = new SessionLineItemPriceDataProductDataOptions
                            {
                                Name = productName
                            }
                        },
                        Quantity = 1
                    }
                },
                Metadata = new Dictionary<string, string>
                {
                    ["paymentId"] = payment.Id.ToString(),
                    ["applicationId"] = payment.ApplicationId.ToString()
                },
                Mode = "payment",
                // The mobile checkout webview closes on these /success and /cancel URLs
                SuccessUrl = $"https://example.com/checkout/success?paymentId={payment.Id}",
                CancelUrl = $"https://example.com/checkout/cancel?paymentId={payment.Id}"
            };

            var session = await new SessionService().CreateAsync(options);

            payment.StripePaymentIntentId = session.Id;
            await _context.SaveChangesAsync();

            return session.Url;
        }

        public async Task<Payment> ConfirmStripePaymentAsync(int paymentId)
        {
            var payment = await _context.Payments.FindAsync(paymentId);

            if (payment == null)
            {
                throw new KeyNotFoundException($"Payment {paymentId} not found.");
            }

            // Already confirmed: don't hit Stripe again or send a second receipt
            if (payment.Status == "Paid")
            {
                return payment;
            }

            if (string.IsNullOrEmpty(payment.StripePaymentIntentId) || !payment.StripePaymentIntentId.StartsWith("cs_"))
            {
                throw new InvalidOperationException("This payment has no associated Stripe session.");
            }

            var session = await new SessionService().GetAsync(payment.StripePaymentIntentId);

            if (session.PaymentStatus == "paid")
            {
                payment.Status = "Paid";
                payment.PaidDate = DateTime.UtcNow;
                await ApplyPaidToSubmissionAsync(payment);

                _context.AuditLogs.Add(new AuditLog
                {
                    ApplicationId = payment.ApplicationId,
                    Action = "Online Payment Confirmed",
                    PerformedBy = payment.UserEmail,
                    Timestamp = DateTime.UtcNow,
                    OldValues = $"PaymentId={payment.Id}, Status=Pending",
                    NewValues = $"Status=Paid, Amount={payment.Currency} {payment.Amount}, StripeSession={session.Id}, StripePaymentIntent={session.PaymentIntentId}"
                });
                await _context.SaveChangesAsync();

                await SendOnlinePaymentReceiptAsync(payment);
            }
            else if (session.Status == "expired" && payment.Status == "Pending")
            {
                payment.Status = "Failed";
                await _context.SaveChangesAsync();
            }

            return payment;
        }

        private async Task SendOnlinePaymentReceiptAsync(Payment payment)
        {
            var submission = await _context.ApplicationSubmissions
                .Include(s => s.ServiceProcedure)
                .FirstOrDefaultAsync(s => s.Id == payment.ApplicationId);

            // Prefer the email on the Stripe payment; fall back to the application's owner
            var toEmail = IsDeliverableEmail(payment.UserEmail) ? payment.UserEmail : submission?.UserEmail;
            if (!IsDeliverableEmail(toEmail)) return;

            await _notificationService.NotifyOnlinePaymentSuccessAsync(toEmail!, new OnlinePaymentReceiptDto
            {
                PaymentId = payment.Id,
                StripeReference = payment.StripePaymentIntentId,
                ApplicationId = payment.ApplicationId,
                ServiceName = ResolveServiceName(submission),
                StageNumber = submission?.CurrentStage ?? 1,
                MaxStages = submission?.MaxStages ?? 1,
                Department = submission?.CurrentDepartment,
                CitizenNic = submission?.CitizenNic ?? string.Empty,
                Amount = payment.Amount,
                Currency = payment.Currency,
                PaidDate = payment.PaidDate ?? DateTime.UtcNow
            });
        }

        // Once a fee is paid, a direct department payment is complete; an application stage goes back to its verification officer.
        private async Task ApplyPaidToSubmissionAsync(Payment payment)
        {
            var submission = await _context.ApplicationSubmissions.FindAsync(payment.ApplicationId);
            if (submission == null) return;

            bool isPureDirectPayment = submission.FormDataJson != null &&
                                       submission.FormDataJson.Contains("\"PaymentType\":\"Direct Department Payment\"") &&
                                       submission.MaxStages <= 1;

            var hasActiveTask = await _context.VerificationTasks.AnyAsync(t => t.ApplicationId == submission.Id && t.Status != "Approved");

            if (isPureDirectPayment && !hasActiveTask)
            {
                submission.StageStatus = "Completed";
            }
            else
            {
                // Only set UnderVerification if citizen has actually submitted the form for CurrentStage
                var hasCurrentStageTask = await _context.VerificationTasks.AnyAsync(t => t.ApplicationId == submission.Id && t.StageNumber == submission.CurrentStage);
                if (hasCurrentStageTask)
                {
                    submission.StageStatus = "UnderVerification";
                }
            }
        }

        private static string ResolveServiceName(ApplicationSubmission? submission)
        {
            var name = submission?.ServiceProcedure?.Name ?? string.Empty;
            if ((string.IsNullOrEmpty(name) || name == "Department Statutory Fee") && submission?.FormDataJson != null)
            {
                try
                {
                    using var doc = System.Text.Json.JsonDocument.Parse(submission.FormDataJson);
                    if (doc.RootElement.TryGetProperty("ServiceName", out var sn) && !string.IsNullOrWhiteSpace(sn.GetString()))
                    {
                        name = sn.GetString()!;
                    }
                }
                catch (System.Text.Json.JsonException) { }
            }
            return string.IsNullOrEmpty(name) ? "Government Service" : name;
        }

        private static bool IsDeliverableEmail(string? email) =>
            !string.IsNullOrWhiteSpace(email) &&
            System.Net.Mail.MailAddress.TryCreate(email, out var address) &&
            address.Host.Contains('.');
    }
}