using System.Threading;
using System.Threading.Tasks;
using AgenticAi.Agents.IntakePlanningAgent;
using Government_Service_Navigator.AgenticAi.Orchestration;

namespace Government_Service_Navigator.AgenticAi.Orchestration.Supervisor.Tools
{
    /// <summary>
    /// Delegate tool for Agent 1 (Intake & Procedure Discovery via Vector RAG).
    /// </summary>
    public interface IIntakeSupervisorTool
    {
        Task<SupervisorToolResult<IntakePlanResponse>> ProcessIntakeAsync(string query, CancellationToken cancellationToken = default);
    }
}
