using System;

namespace Government_Service_Navigator.Backend.Models.Entities
{
    public class Department
    {
        public int Id { get; set; }
        public string DepartmentCode { get; set; } = string.Empty; // e.g. DEP-001 (auto-generated)
        public string Name { get; set; } = string.Empty;
        public string? Category { get; set; } // e.g. Immigration, Transport, Civil, Police, Public Administration
        public string? LogoUrl { get; set; } // Logo image URL or base64 data string
        public string? ContactNumber { get; set; } // Mobile / Telephone
        public string? Email { get; set; } // Official contact email
        public string? Website { get; set; } // Official website/portal
        public string? Address { get; set; } // Head office address
        public string? Description { get; set; } // Department description/mandate
        public string Status { get; set; } = "Active"; // Active, Inactive
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime? UpdatedAt { get; set; }
    }
}
