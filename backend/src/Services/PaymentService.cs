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
            var list = await _context.Payments
                .Where(p => p.UserEmail.ToLower() == email.ToLower())
                .OrderByDescending(p => p.CreatedDate)
                .ToListAsync();

            if (!list.Any())
            {
                list = await _context.Payments
                    .OrderByDescending(p => p.CreatedDate)
                    .ToListAsync();
            }

            return list;
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

                // Update application submission: unlock for Verification Officer review rather than bypassing it
                var submission = await _context.ApplicationSubmissions.FindAsync(payment.ApplicationId);
                if (submission != null)
                {
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
                var submission = await _context.ApplicationSubmissions.FindAsync(payment.ApplicationId);
                if (submission != null)
                {
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
                        var hasCurrentStageTask = await _context.VerificationTasks.AnyAsync(t => t.ApplicationId == submission.Id && t.StageNumber == submission.CurrentStage);
                        if (hasCurrentStageTask)
                        {
                            submission.StageStatus = "UnderVerification";
                        }
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

            var options = new SessionCreateOptions
            {
                PaymentMethodTypes = new List<string> { "card" },
                LineItems = new List<SessionLineItemOptions>
                {
                    new SessionLineItemOptions
                    {
                        PriceData = new SessionLineItemPriceDataOptions
                        {
                            UnitAmount = (long)(amount * 100), // Stripe expects the smallest currency unit
                            Currency = "usd", // sandbox testing currency; adjust once a supported currency is confirmed
                            ProductData = new SessionLineItemPriceDataProductDataOptions
                            {
                                Name = $"Application #{applicationId} Fee"
                            }
                        },
                        Quantity = 1
                    }
                },
                Mode = "payment",
                SuccessUrl = "https://example.com/success?paymentId=" + payment.Id,
                CancelUrl = "https://example.com/cancel?paymentId=" + payment.Id
            };

            var service = new SessionService();
            var session = await service.CreateAsync(options);

            payment.StripePaymentIntentId = session.Id;
            await _context.SaveChangesAsync();

            return (payment, session.Url);
        }
        // for testing in swagger
        public async Task<Payment> ConfirmStripePaymentAsync(int paymentId)
        {
            var payment = await _context.Payments.FindAsync(paymentId);

            if (payment == null)
            {
                throw new KeyNotFoundException($"Payment {paymentId} not found.");
            }

            if (string.IsNullOrEmpty(payment.StripePaymentIntentId))
            {
                throw new InvalidOperationException("This payment has no associated Stripe session.");
            }

            var service = new SessionService();
            var session = await service.GetAsync(payment.StripePaymentIntentId);

            if (session.PaymentStatus == "paid" && payment.Status != "Paid")
            {
                payment.Status = "Paid";
                payment.PaidDate = DateTime.UtcNow;
                await _context.SaveChangesAsync();
            }

            return payment;
        }
    }
}