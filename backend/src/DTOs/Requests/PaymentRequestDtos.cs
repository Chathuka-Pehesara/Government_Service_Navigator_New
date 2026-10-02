using System.ComponentModel.DataAnnotations;
using Government_Service_Navigator.Backend.Validation;

namespace Government_Service_Navigator.Backend.DTOs.Requests
{
    public class CreateManualPaymentDto
    {
        [Range(1, int.MaxValue, ErrorMessage = "A valid application is required.")]
        public int ApplicationId { get; set; }

        [Money]
        public decimal Amount { get; set; }

        [Required(ErrorMessage = "Email is required.")]
        [Email]
        [MaxLength(254)]
        public string UserEmail { get; set; } = string.Empty;

        [Required(ErrorMessage = "Upload the bank deposit slip.")]
        [MaxLength(15_000_000, ErrorMessage = "The slip file is too large (10 MB maximum).")] // may be a data: URL when the upload fallback is used
        public string ManualSlipUrl { get; set; } = string.Empty;
    }

    public class VerifyManualPaymentDto : IValidatableObject
    {
        // true = mark Paid, false = mark Failed/Rejected
        public bool Approved { get; set; }

        [MaxLength(1000, ErrorMessage = "Note must be at most 1000 characters.")]
        [PlainText]
        public string? Note { get; set; }

        public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
        {
            // The citizen is told why their slip was rejected
            if (!Approved && string.IsNullOrWhiteSpace(Note))
                yield return new ValidationResult("Give a reason when rejecting a payment.", new[] { nameof(Note) });
        }
    }

    public class CreateCheckoutSessionDto
    {
        [Range(1, int.MaxValue, ErrorMessage = "A valid application is required.")]
        public int ApplicationId { get; set; }

        [Money]
        public decimal Amount { get; set; }

        [Required(ErrorMessage = "Email is required.")]
        [Email]
        [MaxLength(254)]
        public string UserEmail { get; set; } = string.Empty;
    }

    public class UpdatePaymentStatusDto
    {
        [Required(ErrorMessage = "Status is required.")]
        [AllowedValues("Paid", "Verified", "Failed", "Rejected", "Pending", "PendingVerification",
            ErrorMessage = "Status must be Paid, Verified, Failed, Rejected, Pending or PendingVerification.")]
        public string Status { get; set; } = string.Empty;

        [MaxLength(1000, ErrorMessage = "Note must be at most 1000 characters.")]
        [PlainText]
        public string? Note { get; set; }
    }

    public class DepartmentPaymentDto : IValidatableObject
    {
        [Required(ErrorMessage = "Department is required.")]
        [MaxLength(150)]
        public string Department { get; set; } = string.Empty;

        [MaxLength(200, ErrorMessage = "Service name must be at most 200 characters.")]
        public string? ServiceName { get; set; }

        [Money]
        public decimal Amount { get; set; }

        [Required(ErrorMessage = "Payment method is required.")]
        [AllowedValues("Online", "Manual", "BankTransfer", ErrorMessage = "Payment method must be Online, Manual or BankTransfer.")]
        public string PaymentMethod { get; set; } = "Online"; // "Online" or "Manual" / "BankTransfer"

        [Required(ErrorMessage = "NIC number is required.")]
        [SriLankaNic]
        public string CitizenNic { get; set; } = string.Empty;

        [Required(ErrorMessage = "Email is required.")]
        [Email]
        [MaxLength(254)]
        public string UserEmail { get; set; } = string.Empty;

        [PersonName]
        public string? CitizenName { get; set; }

        [MaxLength(15_000_000, ErrorMessage = "The slip file is too large (10 MB maximum).")] // may be a data: URL when the upload fallback is used
        public string? ManualSlipUrl { get; set; }

        [MaxLength(1000, ErrorMessage = "Notes must be at most 1000 characters.")]
        [PlainText]
        public string? Notes { get; set; }

        [Range(1, int.MaxValue, ErrorMessage = "Application id must be a positive number.")]
        public int? ApplicationId { get; set; }

        public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
        {
            if (PaymentMethod != "Online" && string.IsNullOrWhiteSpace(ManualSlipUrl))
                yield return new ValidationResult("Upload the bank deposit slip for a manual payment.", new[] { nameof(ManualSlipUrl) });
        }
    }

    public class RaiseConcernDto
    {
        [Required(ErrorMessage = "Subject is required.")]
        [StringLength(150, MinimumLength = 3, ErrorMessage = "Subject must be 3-150 characters.")]
        [PlainText]
        public string Subject { get; set; } = string.Empty;

        [Required(ErrorMessage = "Message is required.")]
        [StringLength(2000, MinimumLength = 10, ErrorMessage = "Message must be 10-2000 characters.")]
        [PlainText]
        public string Message { get; set; } = string.Empty;

        [SriLankaPhone]
        public string? ContactPhone { get; set; }
    }

    public class SubmitRevisionDto
    {
        [Required(ErrorMessage = "Revision note is required.")]
        [StringLength(2000, MinimumLength = 5, ErrorMessage = "Revision note must be 5-2000 characters.")]
        [PlainText]
        public string Notes { get; set; } = string.Empty;

        [MaxLength(255)]
        public string? DocumentAttachmentName { get; set; }
    }
}
