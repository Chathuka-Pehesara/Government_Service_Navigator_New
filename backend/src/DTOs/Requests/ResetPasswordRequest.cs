using System.ComponentModel.DataAnnotations;
using Government_Service_Navigator.Backend.Validation;

namespace Government_Service_Navigator.Backend.DTOs.Requests
{
    public class ResetPasswordRequest
    {
        [Required(ErrorMessage = "New password is required.")]
        [StrongPassword]
        public string NewPassword { get; set; } = string.Empty;
    }
}
