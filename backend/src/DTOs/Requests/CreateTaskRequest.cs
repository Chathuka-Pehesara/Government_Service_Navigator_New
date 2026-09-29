using System.ComponentModel.DataAnnotations;
using Government_Service_Navigator.Backend.Validation;

namespace Government_Service_Navigator.Backend.DTOs.Requests
{
    public class CreateTaskRequest
    {
        [Required(ErrorMessage = "ApplicationId is required.")]
        [Range(1, int.MaxValue, ErrorMessage = "ApplicationId must be a positive number.")]
        public int ApplicationId { get; set; }

        [SriLankaNic]
        public string? CitizenNic { get; set; }

        [MaxLength(150, ErrorMessage = "Department must be at most 150 characters.")]
        public string? Department { get; set; }

        [Range(1, 50, ErrorMessage = "Stage must be between 1 and 50.")]
        public int StageNumber { get; set; } = 1;
    }
}
