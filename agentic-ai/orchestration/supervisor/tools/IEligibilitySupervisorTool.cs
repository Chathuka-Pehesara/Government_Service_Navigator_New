using System.Threading;
using System.Threading.Tasks;
using Government_Service_Navigator.AgenticAi.Agents.EligibilityDocumentAgent.DTOs;
using Government_Service_Navigator.AgenticAi.Orchestration;

namespace Government_Service_Navigator.AgenticAi.Orchestration.Supervisor.Tools
{
    /// <summary>
    /// Delegate tool for Agent 2 (Statutory Eligibility & Document Intelligence).
    /// </summary>
    public interface IEligibilitySupervisorTool
    {
        Task<SupervisorToolResult<EligibilityPlanResponse>> EvaluateEligibilityAndEvidenceAsync(
            ApplicationCaseContext? caseContext,
            int serviceId,
            string serviceName,
            int stage,
            CancellationToken cancellationToken = default);
    }
}
