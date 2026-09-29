using System.ComponentModel.DataAnnotations;
using Government_Service_Navigator.Backend.Validation;

namespace Government_Service_Navigator.Backend.DTOs.Requests
{
    public class UpdateOfficerRequest
    {
        [Required(ErrorMessage = "Full name is required.")]
        [PersonName]
        public string FullName { get; set; } = string.Empty;

        [Required(ErrorMessage = "Department is required.")]
        [MaxLength(150, ErrorMessage = "Department must be at most 150 characters.")]
        public string Department { get; set; } = string.Empty;

        [Required(ErrorMessage = "Role is required.")]
        [AllowedValues(OfficerRoles.VerifyingOfficer, OfficerRoles.FinanceOfficer, OfficerRoles.Auditor, OfficerRoles.DepartmentAdmin,
            ErrorMessage = "Role must be Verifying Officer, Finance Officer, Auditor or Department Admin.")]
        public string Role { get; set; } = string.Empty;
    }
}
