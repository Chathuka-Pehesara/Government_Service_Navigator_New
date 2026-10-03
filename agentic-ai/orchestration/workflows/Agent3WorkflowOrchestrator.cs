using System;
using System.Threading;
using System.Threading.Tasks;
using Government_Service_Navigator.AgenticAi.Agents.ActionToolAgent;
using Government_Service_Navigator.AgenticAi.Agents.ActionToolAgent.DTOs;
using Government_Service_Navigator.AgenticAi.State;

namespace Government_Service_Navigator.AgenticAi.Orchestration;

public interface IAgent3WorkflowOrchestrator
{
    Task<WorkflowExecutionState> ExecuteDraftingStageAsync(
        WorkflowExecutionState state,
        ActionDraftRequest request,
        CancellationToken cancellationToken = default);
}

public class Agent3WorkflowOrchestrator : IAgent3WorkflowOrchestrator
{
    private readonly IActionToolAgent _actionAgent;

    public Agent3WorkflowOrchestrator(IActionToolAgent actionAgent)
    {
        _actionAgent = actionAgent;
    }

    public async Task<WorkflowExecutionState> ExecuteDraftingStageAsync(
        WorkflowExecutionState state,
        ActionDraftRequest request,
        CancellationToken cancellationToken = default)
    {
        state.CurrentStage = "DraftingPreFill";
        state.UpdatedAt = DateTime.UtcNow;

        // 1. Invoke Agent 3 (Action/Tool Agent)
        var result = await _actionAgent.PrepareDraftAsync(request, cancellationToken);
        state.ActionResult = result;
        state.DraftApplication = result.Draft;

        // 2. State transition: only a complete draft moves on to Agent 4
        if (result.Draft == null)
        {
            state.CurrentStage = "IneligibleRequirementGap";
        }
        else if (result.IsReadyForValidation)
        {
            state.CurrentStage = "ValidationAndSafety";
        }
        else
        {
            state.CurrentStage = "DraftIncompleteAwaitingCitizen";
        }

        state.UpdatedAt = DateTime.UtcNow;
        return state;
    }
}
