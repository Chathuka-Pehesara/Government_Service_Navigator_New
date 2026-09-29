using System;

namespace Government_Service_Navigator.Backend.Models.Entities
{
    public class RefundRequest
    {
        public int Id { get; set; }

        public int PaymentId { get; set; }
        public Payment? Payment { get; set; }

        public decimal RefundAmount { get; set; }
        public string Reason { get; set; } = string.Empty;

        public RefundStatus Status { get; set; } = RefundStatus.Pending;

        // Manually captured reference since Stripe's refund API isn't used
        // (e.g. bank reverse-transfer confirmation number).
        public string? RefundTransactionRef { get; set; }

        public string RequestedByEmail { get; set; } = string.Empty;

        // Department that handles this refund, captured from the payment's application when the
        // request is created. Finance officers only see refunds for their own department.
        public string? DepartmentName { get; set; }

        // Officer who approved/rejected/completed this request.
        public string? DecidedByEmail { get; set; }
        public string? DecisionNote { get; set; }

        public DateTime RequestedDate { get; set; } = DateTime.UtcNow;
        public DateTime? DecidedDate { get; set; }
        public DateTime? CompletedDate { get; set; }
    }
}