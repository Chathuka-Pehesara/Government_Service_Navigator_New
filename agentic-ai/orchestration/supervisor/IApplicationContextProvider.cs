using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace Government_Service_Navigator.AgenticAi.Orchestration
{
    /// <summary>
    /// Encapsulates application context for the Master Supervisor to reason over.
    /// </summary>
    public class ApplicationCaseContext
    {
        public int ApplicationId { get; set; }
        public int ServiceProcedureId { get; set; }
        public string ServiceName { get; set; } = string.Empty;
        public string DepartmentName { get; set; } = string.Empty;
        public string CitizenNic { get; set; } = string.Empty;
        public string CitizenName { get; set; } = string.Empty;
        public int CitizenAge { get; set; }
        public int CurrentStage { get; set; } = 1;
        public int MaxStages { get; set; } = 1;
        public string StageStatus { get; set; } = string.Empty;
        public Dictionary<string, string> FormAnswers { get; set; } = new();
        public List<string> UploadedDocumentNames { get; set; } = new();
        public decimal PaidAmount { get; set; }
        public bool IsPaymentVerified { get; set; }
    }

    /// <summary>
    /// Service provider implemented by the host application to load case context for the Supervisor.
    /// </summary>
    public interface IApplicationContextProvider
    {
        Task<ApplicationCaseContext?> GetApplicationContextAsync(int applicationId, CancellationToken cancellationToken = default);
    }
}
