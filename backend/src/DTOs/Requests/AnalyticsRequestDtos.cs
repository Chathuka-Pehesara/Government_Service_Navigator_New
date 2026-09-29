using System.ComponentModel.DataAnnotations;
using Government_Service_Navigator.Backend.Validation;

namespace Government_Service_Navigator.Backend.DTOs.Requests
{
    public class SaveReportSnapshotDto
    {
        [Required(ErrorMessage = "Report title is required.")]
        [StringLength(200, MinimumLength = 3, ErrorMessage = "Report title must be 3-200 characters.")]
        [PlainText]
        public string Title { get; set; } = string.Empty;

        [Required(ErrorMessage = "Report period is required.")]
        [MaxLength(50, ErrorMessage = "Report period must be at most 50 characters.")]
        public string Period { get; set; } = string.Empty;

        [Required(ErrorMessage = "Report data is required.")]
        [MaxLength(1_000_000, ErrorMessage = "Report data is too large.")]
        public string DataJson { get; set; } = string.Empty;
    }
}
