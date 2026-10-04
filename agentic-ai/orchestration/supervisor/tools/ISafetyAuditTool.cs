using System.Threading;
using System.Threading.Tasks;
using Government_Service_Navigator.AgenticAi.Orchestration;
using Government_Service_Navigator.AgenticAi.Tools.CheckDuplicateApplication;

namespace Government_Service_Navigator.AgenticAi.Orchestration.Supervisor.Tools
{
    /// <summary>
    /// Delegate tool for Agent 4 (Regulatory Safety & Anti-Collision Duplicate Screening).
    /// </summary>
    public interface ISafetyAuditTool
    {
        Task<SupervisorToolResult<DuplicateCheckOutcome>> AuditSafetyAndDuplicateAsync(
            string citizenNic,
            int serviceId,
            int applicationId,
            int? citizenAge = null,
            List<string>? attachedDocumentNames = null,
            int? stage = null,
            List<string>? requiredDocuments = null,
            CancellationToken cancellationToken = default);
    }
}
