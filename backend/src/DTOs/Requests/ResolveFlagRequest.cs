using System.ComponentModel.DataAnnotations;

namespace Government_Service_Navigator.Backend.DTOs.Requests
{
    public class ResolveFlagRequest
    {
        [Required(ErrorMessage = "Status is required.")]
        [AllowedValues("Reviewed", "Dismissed", ErrorMessage = "Status must be Reviewed or Dismissed.")]
        public string Status { get; set; } = string.Empty;
    }
}
