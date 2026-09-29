using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using Government_Service_Navigator.Backend.Validation;

namespace Government_Service_Navigator.Backend.DTOs.Requests
{
    public class BulkVerifyRequest : IValidatableObject
    {
        [Required]
        [MinLength(1, ErrorMessage = "At least one TaskId must be provided.")]
        [MaxLength(500, ErrorMessage = "At most 500 tasks can be updated at once.")]
        public List<int> TaskIds { get; set; } = new List<int>();

        [Required(ErrorMessage = "Status is required.")]
        [RegularExpression("^(Approved|Rejected|Revised)$", ErrorMessage = "Status must be Approved, Rejected, or Revised.")]
        public string Status { get; set; } = string.Empty;

        [MaxLength(2000, ErrorMessage = "Comments must be at most 2000 characters.")]
        [PlainText]
        public string? Comments { get; set; }

        public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
        {
            if (TaskIds.Any(id => id <= 0))
                yield return new ValidationResult("Task ids must be positive numbers.", new[] { nameof(TaskIds) });
            if (Status is "Rejected" or "Revised" && string.IsNullOrWhiteSpace(Comments))
                yield return new ValidationResult($"Add a comment when the decision is {Status}.", new[] { nameof(Comments) });
        }
    }
}
