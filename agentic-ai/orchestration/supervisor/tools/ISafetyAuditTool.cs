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
            CancellationToken cancellationToken = default);
    }
}
