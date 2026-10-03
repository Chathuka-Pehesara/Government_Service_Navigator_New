using System;
using System.Diagnostics;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Government_Service_Navigator.AgenticAi.Orchestration;
using Government_Service_Navigator.AgenticAi.Tools.CalculateFee;
using Government_Service_Navigator.AgenticAi.Tools.FindAppointmentSlot;

namespace Government_Service_Navigator.AgenticAi.Orchestration.Supervisor.Tools
{
    public class AdministrativeActionTool : IAdministrativeActionTool
    {
        private readonly ICalculateFeeTool _feeTool;
        private readonly IFindAppointmentSlotTool _slotTool;

        public AdministrativeActionTool(
            ICalculateFeeTool feeTool,
            IFindAppointmentSlotTool slotTool)
        {
            _feeTool = feeTool;
            _slotTool = slotTool;
        }

        public async Task<SupervisorToolResult<FeeCalculationResult>> CalculateFeeAsync(
            int serviceId,
            int stage,
            bool expressProcessing = false,
            CancellationToken cancellationToken = default)
        {
            var sw = Stopwatch.StartNew();
            try
            {
                var feeResult = await _feeTool.CalculateAsync(serviceId, expressProcessing, asOf: null, stage: stage, cancellationToken: cancellationToken);
                sw.Stop();

                var tariffDesc = feeResult.LineItems.FirstOrDefault()?.FeeType ?? "Statutory Fee";
                var trace = new AgentExecutionTraceItem
                {
                    AgentId = "agent-3",
                    AgentName = "Agent 3: Administrative Action & Fee Computation",
                    Action = "calculate_fee",
                    Status = "Completed",
                    IsDeterministic = true,
                    LatencyMs = sw.ElapsedMilliseconds,
                    Summary = $"Statutory fee schedule computed: {feeResult.Currency} {feeResult.TotalAmount:N2} ({tariffDesc})"
                };

                return new SupervisorToolResult<FeeCalculationResult>(feeResult, trace, isSuccess: true);
            }
            catch (Exception ex)
            {
                sw.Stop();
                return SupervisorToolResult<FeeCalculationResult>.Failure(
                    "agent-3",
                    "Agent 3: Administrative Action & Fee Computation",
                    "calculate_fee",
                    ex.Message,
                    sw.ElapsedMilliseconds);
            }
        }

        public async Task<SupervisorToolResult<AppointmentSlotResult>> FindAppointmentSlotAsync(
            int serviceId,
            CancellationToken cancellationToken = default)
        {
            var sw = Stopwatch.StartNew();
            try
            {
                var slotResult = await _slotTool.FindSlotAsync(serviceId);
                sw.Stop();

                var trace = new AgentExecutionTraceItem
                {
                    AgentId = "agent-3",
                    AgentName = "Agent 3: Administrative Action & Scheduling",
                    Action = "find_appointment_slot",
                    Status = slotResult.IsSlotFound ? "Completed" : "AttentionRequired",
                    IsDeterministic = true,
                    LatencyMs = sw.ElapsedMilliseconds,
                    Summary = slotResult.IsSlotFound
                        ? $"Earliest verified counter appointment proposed: {slotResult.LocalDisplay} (Office hours: 09:00 - 15:00 SLT)"
                        : $"Appointment lookup: {slotResult.Message}"
                };

                return new SupervisorToolResult<AppointmentSlotResult>(slotResult, trace, isSuccess: true);
            }
            catch (Exception ex)
            {
                sw.Stop();
                return SupervisorToolResult<AppointmentSlotResult>.Failure(
                    "agent-3",
                    "Agent 3: Administrative Action & Scheduling",
                    "find_appointment_slot",
                    ex.Message,
                    sw.ElapsedMilliseconds);
            }
        }
    }
}
