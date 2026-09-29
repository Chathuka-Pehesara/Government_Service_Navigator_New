using System.ComponentModel.DataAnnotations;
using Government_Service_Navigator.Backend.Validation;

namespace Government_Service_Navigator.Backend.DTOs.Requests
{
    public class CreateOfficerRequest
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

        [Required(ErrorMessage = "Department is required.")]
        [MaxLength(150, ErrorMessage = "Department must be at most 150 characters.")]
        public string Department { get; set; } = string.Empty;

        [Required(ErrorMessage = "Role is required.")]
        [AllowedValues(OfficerRoles.VerifyingOfficer, OfficerRoles.FinanceOfficer, OfficerRoles.Auditor, OfficerRoles.DepartmentAdmin,
            ErrorMessage = "Role must be Verifying Officer, Finance Officer, Auditor or Department Admin.")]
        public string Role { get; set; } = string.Empty;
    }

    public static class OfficerRoles
    {
        public const string VerifyingOfficer = "Verifying Officer";
        public const string FinanceOfficer = "Finance Officer";
        public const string Auditor = "Auditor";
        public const string DepartmentAdmin = "Department Admin";
    }
}
