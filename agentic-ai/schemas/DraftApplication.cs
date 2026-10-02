using System;
using System.Collections.Generic;

namespace Government_Service_Navigator.AgenticAi.Schemas
{
    public class DraftApplication
    {
        public int ApplicationId { get; set; }
        public int ServiceProcedureId { get; set; }
        public string ServiceName { get; set; } = string.Empty;
        public string CitizenNic { get; set; } = string.Empty;
        public string CitizenName { get; set; } = string.Empty;
        public int CitizenAge { get; set; }
        public decimal CitizenIncome { get; set; }
        public Dictionary<string, string> FormFields { get; set; } = new();
        public List<string> AttachedDocumentNames { get; set; } = new();
        public decimal CalculatedFee { get; set; }
        public int Stage { get; set; } = 1;
        public int MaxStages { get; set; } = 1;
        public string DepartmentName { get; set; } = string.Empty;
        public DateTime? ProposedAppointmentDate { get; set; }
        public DateTime DraftedAt { get; set; } = DateTime.UtcNow;
    }
}
