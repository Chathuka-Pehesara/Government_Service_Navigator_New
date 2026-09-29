using System.ComponentModel.DataAnnotations;
using Government_Service_Navigator.Backend.Validation;

namespace Government_Service_Navigator.Backend.DTOs.Requests
{
    public class VerificationDecisionRequest : IValidatableObject
    {
        [Required(ErrorMessage = "Status is required.")]
        [RegularExpression("^(Approved|Rejected|Revised)$", ErrorMessage = "Status must be Approved, Rejected, or Revised.")]
        public string Status { get; set; } = string.Empty;

        [MaxLength(2000, ErrorMessage = "Comments must be at most 2000 characters.")]
        [PlainText]
        public string? Comments { get; set; }

        [Range(1, int.MaxValue, ErrorMessage = "Rejection reason must be a valid option.")]
        public int? RejectionReasonId { get; set; }

        public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
        {
            // The citizen needs to know what to fix
            if (Status is "Rejected" or "Revised" && string.IsNullOrWhiteSpace(Comments) && RejectionReasonId == null)
                yield return new ValidationResult($"Add a comment or choose a reason when the decision is {Status}.", new[] { nameof(Comments) });
        }
    }
}
