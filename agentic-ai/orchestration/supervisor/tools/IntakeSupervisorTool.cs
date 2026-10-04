using System;
using System.Diagnostics;
using System.Threading;
using System.Threading.Tasks;
using AgenticAi.Agents.IntakePlanningAgent;
using Government_Service_Navigator.AgenticAi.Orchestration;

namespace Government_Service_Navigator.AgenticAi.Orchestration.Supervisor.Tools
{
    public class IntakeSupervisorTool : IIntakeSupervisorTool
    {
        private readonly IIntakePlanningAgent _agent1Intake;

        public IntakeSupervisorTool(IIntakePlanningAgent agent1Intake)
        {
            _agent1Intake = agent1Intake;
        }

        public async Task<SupervisorToolResult<IntakePlanResponse>> ProcessIntakeAsync(string query, CancellationToken cancellationToken = default)
        {
            var sw = Stopwatch.StartNew();
            try
            {
                var plan = await _agent1Intake.GeneratePlanAsync(new IntakePlanRequest(query), cancellationToken);
                sw.Stop();

                bool isNotFound = string.IsNullOrWhiteSpace(plan.RecommendedService)
                    || plan.RecommendedService.Equals("Service Not Found", StringComparison.OrdinalIgnoreCase)
                    || plan.RecommendedService.Contains("Not Found", StringComparison.OrdinalIgnoreCase);

                var trace = new AgentExecutionTraceItem
                {
                    AgentId = "agent-1",
                    AgentName = "Agent 1: Intake & Procedure Discovery",
                    Action = "synthesize_intake_roadmap",
                    Status = isNotFound ? "AttentionRequired" : "Completed",
                    IsDeterministic = false,
                    LatencyMs = sw.ElapsedMilliseconds,
                    Summary = isNotFound
                        ? "Service Not Found: No matching statutory policies exist in the vector knowledge base."
                        : $"Identified statutory procedure: {plan.RecommendedService} with {plan.StepByStepPlan.Count} sequential milestones."
                };

                return new SupervisorToolResult<IntakePlanResponse>(plan, trace, isSuccess: true);
            }
            catch (Exception ex)
            {
                sw.Stop();
                return SupervisorToolResult<IntakePlanResponse>.Failure(
                    "agent-1",
                    "Agent 1: Intake & Procedure Discovery",
                    "synthesize_intake_roadmap",
                    ex.Message,
                    sw.ElapsedMilliseconds);
            }
        }
    }
}
