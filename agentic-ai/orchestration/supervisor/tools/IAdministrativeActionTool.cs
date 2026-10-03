using System.Threading;
using System.Threading.Tasks;
using Government_Service_Navigator.AgenticAi.Orchestration;
using Government_Service_Navigator.AgenticAi.Tools.CalculateFee;
using Government_Service_Navigator.AgenticAi.Tools.FindAppointmentSlot;

namespace Government_Service_Navigator.AgenticAi.Orchestration.Supervisor.Tools
{
    /// <summary>
    /// Delegate tool for Agent 3 (Administrative Action: Fee Computation & Appointment Scheduling).
    /// </summary>
    public interface IAdministrativeActionTool
    {
        Task<SupervisorToolResult<FeeCalculationResult>> CalculateFeeAsync(
            int serviceId,
            int stage,
            bool expressProcessing = false,
            CancellationToken cancellationToken = default);

        Task<SupervisorToolResult<AppointmentSlotResult>> FindAppointmentSlotAsync(
            int serviceId,
            CancellationToken cancellationToken = default);
    }
}
