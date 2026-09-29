using Government_Service_Navigator.Backend.Data.Context;
using Government_Service_Navigator.Backend.Models.Entities;
using Government_Service_Navigator.Backend.Services.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace Government_Service_Navigator.Backend.Services
{
    public class RefundService : IRefundService
    {
        public const int RefundWindowDays = 7;

        private readonly AppDbContext _context;
        private readonly INotificationService _notificationService;

        public RefundService(AppDbContext context, INotificationService notificationService)
        {
            _context = context;
            _notificationService = notificationService;
        }

        // Methods implemented in upcoming commits.
        // The refund is always for the full paid amount; the citizen can't choose it.
        public async Task<RefundRequest> CreateRefundRequestAsync(int paymentId, string reason, string requestedByEmail)
        {
            var payment = await _context.Payments.FindAsync(paymentId);

            if (payment == null)
            {
                throw new KeyNotFoundException($"Payment {paymentId} not found.");
            }

            if (!string.Equals(payment.UserEmail, requestedByEmail, StringComparison.OrdinalIgnoreCase))
            {
                // Same response as a missing payment, so other citizens' payment ids aren't revealed
                throw new KeyNotFoundException($"Payment {paymentId} not found.");
            }

            if (payment.Status != "Paid")
            {
                throw new InvalidOperationException("Only paid payments are eligible for a refund request.");
            }

            if (payment.PaidDate == null || (DateTime.UtcNow - payment.PaidDate.Value).TotalDays > RefundWindowDays)
            {
                throw new InvalidOperationException($"Refund window has expired. Refunds are only allowed within {RefundWindowDays} days of payment.");
            }

            // Only a rejected or failed refund lets the citizen ask again
            var hasActiveRefund = await _context.RefundRequests.AnyAsync(r =>
                r.PaymentId == paymentId &&
                (r.Status == RefundStatus.Pending || r.Status == RefundStatus.Approved || r.Status == RefundStatus.Processing));

            if (hasActiveRefund)
            {
                throw new InvalidOperationException("An active refund request already exists for this payment.");
            }

            if (await _context.RefundRequests.AnyAsync(r => r.PaymentId == paymentId && r.Status == RefundStatus.Completed))
            {
                throw new InvalidOperationException("This payment has already been refunded.");
            }
        
            var departmentName = await _context.ApplicationSubmissions
                .Where(s => s.Id == payment.ApplicationId)
                .Select(s => s.CurrentDepartment)
                .FirstOrDefaultAsync();

            var refund = new RefundRequest
            {
                PaymentId = paymentId,
                DepartmentName = departmentName,
                Payment = payment,
                RefundAmount = payment.Amount,
                Reason = reason,
                RequestedByEmail = requestedByEmail,
                Status = RefundStatus.Pending
            };

            _context.RefundRequests.Add(refund);
            await _context.SaveChangesAsync();

            await _notificationService.NotifyRefundRequestedAsync(requestedByEmail, refund);

            _context.AuditLogs.Add(new AuditLog
            {
                ApplicationId = payment.ApplicationId,
                Action = "RefundRequestCreated",
                PerformedBy = requestedByEmail,
                Timestamp = DateTime.UtcNow,
                OldValues = "",
                NewValues = $"RefundId={refund.Id}, Amount={refund.RefundAmount}, Status=Pending"
            });
            await _context.SaveChangesAsync();

            return refund;
        }


        // A refund belongs to the department captured on it at creation time.
        private static IQueryable<RefundRequest> InDepartment(IQueryable<RefundRequest> query, string department)
        {
            var targetDept = department.Trim();
            return query.Where(r => r.DepartmentName != null && EF.Functions.ILike(r.DepartmentName, targetDept));
        }

        public async Task<bool> IsInDepartmentAsync(int refundId, string department)
        {
            return await InDepartment(_context.RefundRequests.Where(r => r.Id == refundId), department).AnyAsync();
        }

        public async Task<List<RefundRequest>> GetAllAsync(string? status, string? department)
        {
            var query = _context.RefundRequests
                .Include(r => r.Payment)
                .AsQueryable();

            if (department != null)
            {
                query = InDepartment(query, department);
            }

            if (!string.IsNullOrWhiteSpace(status) &&
                Enum.TryParse<RefundStatus>(status, ignoreCase: true, out var parsedStatus))
            {
                query = query.Where(r => r.Status == parsedStatus);
            }

            return await query
                .OrderByDescending(r => r.RequestedDate)
                .ToListAsync();
        }

        public async Task<RefundRequest?> GetRefundByIdAsync(int id)
        {
            return await _context.RefundRequests
                .Include(r => r.Payment)
                .FirstOrDefaultAsync(r => r.Id == id);
        }

        public async Task<List<RefundRequest>> GetByRequesterAsync(string email)
        {
            return await _context.RefundRequests
                .Where(r => r.RequestedByEmail == email)
                .Include(r => r.Payment)
                .OrderByDescending(r => r.RequestedDate)
                .ToListAsync();
        }

        public async Task<RefundRequest> ApproveAsync(int id, string decidedByEmail, string? note)
        {
            var refund = await _context.RefundRequests.FindAsync(id);

            if (refund == null)
            {
                throw new KeyNotFoundException($"Refund request {id} not found.");
            }

            if (refund.Status != RefundStatus.Pending)
            {
                throw new InvalidOperationException("Only pending refund requests can be approved.");
            }

            refund.Status = RefundStatus.Approved;
            refund.DecidedByEmail = decidedByEmail;
            refund.DecisionNote = note;
            refund.DecidedDate = DateTime.UtcNow;

            await _context.SaveChangesAsync();

                        await _notificationService.NotifyRefundStatusAsync(refund.RequestedByEmail, refund.Id, "Approved", note);

            _context.AuditLogs.Add(new AuditLog
            {
                ApplicationId = 0,
                Action = "RefundApproved",
                PerformedBy = decidedByEmail,
                Timestamp = DateTime.UtcNow,
                OldValues = "Status=Pending",
                NewValues = $"RefundId={refund.Id}, Status=Approved, Note={note}"
            });
            await _context.SaveChangesAsync();

            return refund;
        }


        public async Task<RefundRequest> RejectAsync(int id, string decidedByEmail, string? note)
        {
            // Payment is needed for the email (currency, and whether the refund window is still open)
            var refund = await _context.RefundRequests
                .Include(r => r.Payment)
                .FirstOrDefaultAsync(r => r.Id == id);

            if (refund == null)
            {
                throw new KeyNotFoundException($"Refund request {id} not found.");
            }

            if (refund.Status != RefundStatus.Pending)
            {
                throw new InvalidOperationException("Only pending refund requests can be rejected.");
            }

            refund.Status = RefundStatus.Rejected;
            refund.DecidedByEmail = decidedByEmail;
            refund.DecisionNote = note;
            refund.DecidedDate = DateTime.UtcNow;

            await _context.SaveChangesAsync();

            await _notificationService.NotifyRefundRejectedAsync(refund.RequestedByEmail, refund);

            _context.AuditLogs.Add(new AuditLog
            {
                ApplicationId = 0,
                Action = "RefundRejected",
                PerformedBy = decidedByEmail,
                Timestamp = DateTime.UtcNow,
                OldValues = "Status=Pending",
                NewValues = $"RefundId={refund.Id}, Status=Rejected, Note={note}"
            });
            await _context.SaveChangesAsync();

            return refund;
        }

        public async Task<RefundRequest> ProcessAsync(int id, string transactionRef)
        {
            var refund = await _context.RefundRequests.FindAsync(id);

            if (refund == null)
            {
                throw new KeyNotFoundException($"Refund request {id} not found.");
            }

            if (refund.Status != RefundStatus.Approved)
            {
                throw new InvalidOperationException("Only approved refund requests can be processed.");
            }

            if (string.IsNullOrWhiteSpace(transactionRef))
            {
                throw new ArgumentException("A transaction reference is required to process a refund.");
            }

            refund.Status = RefundStatus.Processing;
            refund.RefundTransactionRef = transactionRef;

            await _context.SaveChangesAsync();

            return refund;
        }

        public async Task<RefundRequest> CompleteAsync(int id)
        {
            var refund = await _context.RefundRequests
                .Include(r => r.Payment)
                .FirstOrDefaultAsync(r => r.Id == id);

            if (refund == null)
            {
                throw new KeyNotFoundException($"Refund request {id} not found.");
            }

            if (refund.Status != RefundStatus.Processing)
            {
                throw new InvalidOperationException("Only processing refund requests can be completed.");
            }

            refund.Status = RefundStatus.Completed;
            refund.CompletedDate = DateTime.UtcNow;

            // Reflect the refund on the original payment.
            if (refund.Payment != null)
            {
                refund.Payment.Status = "Refunded";
            }

            await _context.SaveChangesAsync();

            await _notificationService.NotifyRefundCompletedAsync(refund.RequestedByEmail, refund);

            _context.AuditLogs.Add(new AuditLog
            {
                ApplicationId = refund.Payment?.ApplicationId ?? 0,
                Action = "RefundCompleted",
                PerformedBy = "system",
                Timestamp = DateTime.UtcNow,
                OldValues = "Status=Processing",
                NewValues = $"RefundId={refund.Id}, Status=Completed"
            });
            await _context.SaveChangesAsync();

            return refund;
        }
    }
}