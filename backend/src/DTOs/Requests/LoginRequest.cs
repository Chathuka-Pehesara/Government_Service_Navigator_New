using System.ComponentModel.DataAnnotations;

namespace Government_Service_Navigator.Backend.DTOs.Requests
{
    // Shared by citizen, officer and admin login. No strength rule here: existing accounts
    // may have passwords set before StrongPassword existed.
    public class LoginRequest
    {
        [Required(ErrorMessage = "Email is required.")]
        [EmailAddress(ErrorMessage = "Enter a valid email address.")]
        [MaxLength(254, ErrorMessage = "Email must be at most 254 characters.")]
        public string Email { get; set; } = string.Empty;

        [Required(ErrorMessage = "Password is required.")]
        [MaxLength(128, ErrorMessage = "Password must be at most 128 characters.")]
        public string Password { get; set; } = string.Empty;
    }
}
