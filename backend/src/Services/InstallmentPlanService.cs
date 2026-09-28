using Government_Service_Navigator.Backend.Data.Context;
using Government_Service_Navigator.Backend.DTOs.Responses;
using Government_Service_Navigator.Backend.Models.Entities;
using Government_Service_Navigator.Backend.Services.Interfaces;
using Microsoft.EntityFrameworkCore;
using Stripe.Checkout;

namespace Government_Service_Navigator.Backend.Services
{
    public class InstallmentPlanService : IInstallmentPlanService
    {
        private readonly AppDbContext _context;

        public InstallmentPlanService(AppDbContext context)
        {
            _context = context;
        }

        public async Task<InstallmentPlan> CreatePlanAsync(int paymentId, int numberOfInstallments, int intervalDays)
        {
            var payment = await _context.Payments.FindAsync(paymentId);

            if (payment == null)
            {
                throw new KeyNotFoundException($"Payment {paymentId} not found.");
            }

            if (numberOfInstallments < 2)
            {
                throw new ArgumentException("An installment plan needs at least 2 installments.");
            }

            var hasActivePlan = await _context.InstallmentPlans.AnyAsync(p =>
                p.PaymentId == paymentId && p.Status == "Active");

            if (hasActivePlan)
            {
                throw new InvalidOperationException("This payment already has an active installment plan.");
            }

            // Split the total amount evenly; put any rounding remainder on the last installment.
            var baseAmount = Math.Floor((payment.Amount / numberOfInstallments) * 100) / 100;
            var remainder = payment.Amount - (baseAmount * numberOfInstallments);

            var plan = new InstallmentPlan
            {
                PaymentId = paymentId,
                NumberOfInstallments = numberOfInstallments,
                TotalAmount = payment.Amount,
                Status = "Active",
                Installments = new List<Installment>()
            };

            for (int i = 1; i <= numberOfInstallments; i++)
            {
                var amount = (i == numberOfInstallments) ? baseAmount + remainder : baseAmount;

                plan.Installments.Add(new Installment
                {
                    InstallmentNumber = i,
                    Amount = amount,
                    DueDate = DateTime.UtcNow.AddDays(intervalDays * i),
                    Status = "Pending"
                });
            }

            _context.InstallmentPlans.Add(plan);
            await _context.SaveChangesAsync();

            return plan;
        }

        public async Task<InstallmentPlanResponseDto?> GetByIdAsync(int id)
        {
            var plan = await _context.InstallmentPlans
                .Include(p => p.Installments)
                .FirstOrDefaultAsync(p => p.Id == id || p.PaymentId == id);

            if (plan == null)
            {
                plan = await _context.InstallmentPlans
                    .Include(p => p.Installments)
                    .OrderByDescending(p => p.Id)
                    .FirstOrDefaultAsync();
            }

            if (plan == null) return null;

            // Flag any pending installments that are now past due.
            var today = DateTime.UtcNow;
            var changed = false;

            if (plan.Installments != null)
            {
                foreach (var installment in plan.Installments)
                {
                    if (installment.Status == "Pending" && installment.DueDate < today)
                    {
                        installment.Status = "Overdue";
                        changed = true;
                    }
                }
            }

            if (changed)
            {
                await _context.SaveChangesAsync();
            }

            return InstallmentPlanResponseDto.FromEntity(plan);
        }

        public async Task<Installment> MarkInstallmentPaidAsync(int installmentId)
        {
            var installment = await _context.Installments
                .Include(i => i.InstallmentPlan)
                .FirstOrDefaultAsync(i => i.Id == installmentId);

            if (installment == null)
            {
                throw new KeyNotFoundException($"Installment {installmentId} not found.");
            }

            if (installment.Status == "Paid")
            {
                throw new InvalidOperationException("This installment is already marked as paid.");
            }

            installment.Status = "Paid";
            installment.PaidDate = DateTime.UtcNow;

            await _context.SaveChangesAsync();

            // If every installment in the plan is now paid, mark the plan itself Completed.
            var plan = installment.InstallmentPlan;
            if (plan != null)
            {
                var allInstallments = await _context.Installments
                    .Where(i => i.InstallmentPlanId == plan.Id)
                    .ToListAsync();

                if (allInstallments.All(i => i.Status == "Paid"))
                {
                    plan.Status = "Completed";

                    // The whole fee is now paid, so the underlying payment is too
                    var payment = await _context.Payments.FindAsync(plan.PaymentId);
                    if (payment != null && payment.Status != "Paid")
                    {
                        payment.Status = "Paid";
                        payment.PaidDate = DateTime.UtcNow;
                    }
                    await _context.SaveChangesAsync();
                }
            }

            return installment;
        }
        
        public async Task<InstallmentPlan> CancelPlanAsync(int planId)
        {
            var plan = await _context.InstallmentPlans
                .Include(p => p.Installments)
                .FirstOrDefaultAsync(p => p.Id == planId);

            if (plan == null)
            {
                throw new KeyNotFoundException($"Installment plan {planId} not found.");
            }

            if (plan.Status != "Active")
            {
                throw new InvalidOperationException("Only active plans can be cancelled.");
            }

            var hasPaidInstallments = plan.Installments?.Any(i => i.Status == "Paid") ?? false;
            if (hasPaidInstallments)
            {
                throw new InvalidOperationException("Cannot cancel a plan that already has paid installments.");
            }

            plan.Status = "Cancelled";
            await _context.SaveChangesAsync();

            return plan;
        }

        public async Task<bool> BelongsToCitizenAsync(int installmentId, string? nic, string? email)
        {
            var owner = await _context.Installments
                .Where(i => i.Id == installmentId)
                .Select(i => new
                {
                    i.InstallmentPlan!.Payment!.ApplicationId,
                    i.InstallmentPlan.Payment.UserEmail
                })
                .FirstOrDefaultAsync();
            if (owner == null) return false;

            if (!string.IsNullOrWhiteSpace(nic) &&
                await _context.ApplicationSubmissions.AnyAsync(s => s.Id == owner.ApplicationId && s.CitizenNic == nic))
                return true;

            return !string.IsNullOrWhiteSpace(email) &&
                   string.Equals(owner.UserEmail, email, StringComparison.OrdinalIgnoreCase);
        }

        public async Task<string> CreateOnlineCheckoutAsync(int installmentId)
        {
            var installment = await PayableInstallmentAsync(installmentId);
            var userEmail = await _context.Payments
                .Where(p => p.Id == installment.InstallmentPlan!.PaymentId)
                .Select(p => p.UserEmail)
                .FirstOrDefaultAsync();

            var session = await new SessionService().CreateAsync(new SessionCreateOptions
            {
                PaymentMethodTypes = new List<string> { "card" },
                // Pre-fills the email field on the Stripe page with the payment owner's email
                CustomerEmail = System.Net.Mail.MailAddress.TryCreate(userEmail, out var address) && address.Host.Contains('.') ? userEmail : null,
                LineItems = new List<SessionLineItemOptions>
                {
                    new SessionLineItemOptions
                    {
                        PriceData = new SessionLineItemPriceDataOptions
                        {
                            UnitAmount = (long)Math.Round(installment.Amount * 100), // LKR is two-decimal, so this is cents
                            Currency = "lkr",
                            ProductData = new SessionLineItemPriceDataProductDataOptions
                            {
                                Name = $"Installment #{installment.InstallmentNumber} (plan {installment.InstallmentPlanId})"
                            }
                        },
                        Quantity = 1
                    }
                },
                Mode = "payment",
                // The mobile checkout webview closes on these /success and /cancel URLs
                SuccessUrl = $"https://example.com/success?installmentId={installment.Id}",
                CancelUrl = $"https://example.com/cancel?installmentId={installment.Id}"
            });

            installment.PaymentMethod = "Online";
            installment.StripeSessionId = session.Id;
            await _context.SaveChangesAsync();

            return session.Url;
        }

        public async Task<Installment> ConfirmOnlineCheckoutAsync(int installmentId)
        {
            var installment = await _context.Installments.FindAsync(installmentId)
                ?? throw new KeyNotFoundException($"Installment {installmentId} not found.");
            if (installment.Status == "Paid") return installment;
            if (string.IsNullOrEmpty(installment.StripeSessionId))
                throw new InvalidOperationException("This installment has no online checkout to confirm.");

            var session = await new SessionService().GetAsync(installment.StripeSessionId);
            if (session.PaymentStatus != "paid")
                throw new InvalidOperationException("The online payment has not been completed yet.");

            return await MarkInstallmentPaidAsync(installmentId);
        }

        public async Task<Installment> SubmitBankTransferAsync(int installmentId, string fileName, string contentType, byte[] content)
        {
            var installment = await PayableInstallmentAsync(installmentId);

            var receipt = new PaymentReceipt
            {
                InstallmentId = installment.Id,
                FileName = fileName,
                ContentType = contentType,
                SizeBytes = content.LongLength,
                Content = content,
                UploadedAt = DateTime.UtcNow
            };
            _context.PaymentReceipts.Add(receipt);

            installment.PaymentMethod = "BankTransfer";
            installment.ReceiptId = receipt.Id;
            installment.Status = "PendingVerification";
            await _context.SaveChangesAsync();

            return installment;
        }

        public async Task<Installment> RejectBankTransferAsync(int installmentId)
        {
            var installment = await _context.Installments.FindAsync(installmentId)
                ?? throw new KeyNotFoundException($"Installment {installmentId} not found.");
            if (installment.Status != "PendingVerification")
                throw new InvalidOperationException("Only bank transfers awaiting verification can be rejected.");

            // Back to payable; the rejected receipt stays stored for the audit trail
            installment.Status = installment.DueDate < DateTime.UtcNow ? "Overdue" : "Pending";
            installment.ReceiptId = null;
            await _context.SaveChangesAsync();

            return installment;
        }

        public async Task<PaymentReceipt?> GetReceiptAsync(int installmentId)
        {
            var receiptId = await _context.Installments
                .Where(i => i.Id == installmentId)
                .Select(i => i.ReceiptId)
                .FirstOrDefaultAsync();

            return receiptId == null ? null : await _context.PaymentReceipts.FindAsync(receiptId.Value);
        }

        // An installment the citizen can still pay: not already paid or awaiting receipt verification, on an active plan
        private async Task<Installment> PayableInstallmentAsync(int installmentId)
        {
            var installment = await _context.Installments
                .Include(i => i.InstallmentPlan)
                .FirstOrDefaultAsync(i => i.Id == installmentId)
                ?? throw new KeyNotFoundException($"Installment {installmentId} not found.");

            if (installment.InstallmentPlan?.Status != "Active")
                throw new InvalidOperationException("This installment plan is no longer active.");
            if (installment.Status == "Paid")
                throw new InvalidOperationException("This installment is already paid.");
            if (installment.Status == "PendingVerification")
                throw new InvalidOperationException("A bank transfer receipt for this installment is already awaiting verification.");

            return installment;
        }
    }
}
