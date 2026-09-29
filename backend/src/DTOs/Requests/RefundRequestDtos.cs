using System.ComponentModel.DataAnnotations;
using Government_Service_Navigator.Backend.Validation;

namespace Government_Service_Navigator.Backend.DTOs.Requests
{
    public class CreateRefundRequestDto
    {
        [Range(1, int.MaxValue, ErrorMessage = "Select a payment to refund.")]
        public int PaymentId { get; set; }

        // Ignored: the refund is always the full paid amount (RefundService).
        public decimal RefundAmount { get; set; }

        [Required(ErrorMessage = "Reason for the refund is required.")]
        [StringLength(1000, MinimumLength = 10, ErrorMessage = "Reason must be 10-1000 characters.")]
        [PlainText]
        public string Reason { get; set; } = string.Empty;
    }

    public class RefundDecisionDto
    {
        // Note appended by the officer approving/rejecting. Required when rejecting (RefundsController).
        [MaxLength(1000, ErrorMessage = "Note must be at most 1000 characters.")]
        [PlainText]
        public string? Note { get; set; }
    }

    public class RefundProcessDto
    {
        // Manual reference e.g. bank reverse-transfer confirmation number.
        [Required(ErrorMessage = "Transaction reference is required.")]
        [RegularExpression(@"^[A-Za-z0-9][A-Za-z0-9\-_/]{2,99}$",
            ErrorMessage = "Transaction reference must be 3-100 letters, numbers, dashes, underscores or slashes.")]
        public string TransactionRef { get; set; } = string.Empty;
    }
}
