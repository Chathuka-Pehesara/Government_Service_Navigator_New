using System.ComponentModel.DataAnnotations;
using Government_Service_Navigator.Backend.Validation;

namespace Government_Service_Navigator.Backend.DTOs.Requests
{
    public class RegisterRequest
    {
        [Required(ErrorMessage = "Full name is required.")]
        [PersonName]
        public string FullName { get; set; } = string.Empty;

        [Required(ErrorMessage = "Email is required.")]
        [Email]
        [MaxLength(254, ErrorMessage = "Email must be at most 254 characters.")]
        public string Email { get; set; } = string.Empty;

        [Required(ErrorMessage = "Password is required.")]
        [StrongPassword]
        public string Password { get; set; } = string.Empty;

        [Required(ErrorMessage = "NIC number is required.")]
        [SriLankaNic]
        public string NicNumber { get; set; } = string.Empty;
    }
}
