using System;
using System.Threading;
using System.Threading.Tasks;
using Government_Service_Navigator.AgenticAi.Agents.EligibilityDocumentAgent;
using Government_Service_Navigator.AgenticAi.Agents.EligibilityDocumentAgent.DTOs;
using Government_Service_Navigator.AgenticAi.State;

namespace Government_Service_Navigator.AgenticAi.Orchestration;

public interface IAgent2WorkflowOrchestrator
{
    Task<WorkflowExecutionState> ExecuteEligibilityStageAsync(
        WorkflowExecutionState state,
        EligibilityPlanRequest request,
        CancellationToken cancellationToken = default);
}

public class Agent2WorkflowOrchestrator : IAgent2WorkflowOrchestrator
{
    private readonly IEligibilityDocumentAgent _eligibilityAgent;

    public Agent2WorkflowOrchestrator(IEligibilityDocumentAgent eligibilityAgent)
    {
        _eligibilityAgent = eligibilityAgent;
    }

    public async Task<WorkflowExecutionState> ExecuteEligibilityStageAsync(
        WorkflowExecutionState state,
        EligibilityPlanRequest request,
        CancellationToken cancellationToken = default)
    {
        state.CurrentStage = "EligibilityAndDocumentAnalysis";
        state.UpdatedAt = DateTime.UtcNow;

        // 1. Invoke Agent 2 (Eligibility & Document Analysis RAG Agent)
        var result = await _eligibilityAgent.EvaluateEligibilityAsync(request, cancellationToken);
        state.EligibilityResult = result;

        // 2. State transition evaluation
        if (result.IsEligible)
        {
            state.CurrentStage = "DraftingPreFill";
        }
        else
        {
            state.CurrentStage = "IneligibleRequirementGap";
        }

        state.UpdatedAt = DateTime.UtcNow;
        return state;
    }
}
