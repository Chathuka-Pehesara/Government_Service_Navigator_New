using System.ComponentModel.DataAnnotations;
using Government_Service_Navigator.Backend.Validation;

namespace Government_Service_Navigator.Backend.DTOs.Requests
{
    public class CreateTemplateRequest : IValidatableObject
    {
        [Required(ErrorMessage = "Form name is required.")]
        [StringLength(200, MinimumLength = 3, ErrorMessage = "Form name must be 3-200 characters.")]
        [PlainText]
        public string FormName { get; set; } = string.Empty;

        [MaxLength(300, ErrorMessage = "Subtitle must be at most 300 characters.")]
        [PlainText]
        public string? SubTitle { get; set; }

        [MaxLength(5000, ErrorMessage = "Law text must be at most 5000 characters.")]
        [PlainText]
        public string? LawText { get; set; }

        [Range(1, int.MaxValue, ErrorMessage = "Service id must be a positive number.")]
        public int? ServiceProcedureId { get; set; }

        [MaxLength(150, ErrorMessage = "Department must be at most 150 characters.")]
        public string? Department { get; set; }

        [Range(1, 50, ErrorMessage = "Stage must be between 1 and 50.")]
        public int StageOrder { get; set; } = 1;

        [MaxLength(500, ErrorMessage = "Stage description must be at most 500 characters.")]
        [PlainText]
        public string? StageDescription { get; set; }

        [RegularExpression("^(?i:Active|Inactive)$", ErrorMessage = "Status must be Active or Inactive.")]
        public string? Status { get; set; }

        [MaxLength(200, ErrorMessage = "A form can have at most 200 fields.")]
        public List<FormFieldDto> Fields { get; set; } = new List<FormFieldDto>();

        public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
        {
            // Citizens' answers are stored keyed by label, so two inputs with the same label would overwrite each other
            var duplicates = Fields
                .Where(f => !FormFieldDto.DisplayOnlyTypes.Contains(f.Type) && !string.IsNullOrWhiteSpace(f.Label))
                .GroupBy(f => f.Label.Trim(), StringComparer.OrdinalIgnoreCase)
                .Where(g => g.Count() > 1)
                .Select(g => g.Key)
                .ToList();
            if (duplicates.Count > 0)
                yield return new ValidationResult($"Each field needs a unique label. Repeated: {string.Join(", ", duplicates)}.", new[] { nameof(Fields) });
        }
    }

    public class FormFieldDto : IValidatableObject
    {
        public static readonly string[] Types =
            { "heading", "paragraph", "text", "textarea", "number", "date", "select", "multiselect", "table", "file", "payment" };
        public static readonly string[] DisplayOnlyTypes = { "heading", "paragraph" };

        // For heading and paragraph fields this is the text shown to the citizen, so it can be long
        [Required(ErrorMessage = "Every field needs a label.")]
        [PlainText]
        public string Label {get; set;} = string.Empty;

        [Required(ErrorMessage = "Every field needs a type.")]
        public string Type {get; set;} = string.Empty;

        [MaxLength(5000, ErrorMessage = "Field options must be at most 5000 characters.")]
        public string? Options {get; set;}

        public bool? Required {get; set;}

        public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
        {
            if (!Types.Contains(Type))
                yield return new ValidationResult($"Field '{Label}' has an unknown type '{Type}'.", new[] { nameof(Type) });

            var maxLabel = DisplayOnlyTypes.Contains(Type) ? 5000 : 300;
            if (Label.Length > maxLabel)
                yield return new ValidationResult($"Field labels must be at most {maxLabel} characters.", new[] { nameof(Label) });

            // A dropdown with nothing to choose can never be answered
            if ((Type == "select" || Type == "multiselect") && string.IsNullOrWhiteSpace(Options))
                yield return new ValidationResult($"Dropdown field '{Label}' needs at least one option.", new[] { nameof(Options) });
        }
    }

    public class UpdateTemplateStatusRequest
    {
        [Required(ErrorMessage = "Status is required.")]
        [RegularExpression("^(?i:Active|Inactive)$", ErrorMessage = "Status must be Active or Inactive.")]
        public string Status { get; set; } = string.Empty;
    }
}
