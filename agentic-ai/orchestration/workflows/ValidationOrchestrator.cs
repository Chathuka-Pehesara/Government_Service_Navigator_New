using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Government_Service_Navigator.AgenticAi.Agents.ValidationSafety;
using Government_Service_Navigator.AgenticAi.Schemas;
using Government_Service_Navigator.AgenticAi.State;

namespace Government_Service_Navigator.AgenticAi.Orchestration
{
    public interface IValidationOrchestrator
    {
        Task<WorkflowExecutionState> ExecuteStageAsync(
            WorkflowExecutionState state, 
            DraftApplication draft, 
            List<string>? requiredDocuments = null
        );
    }

    public class ValidationOrchestrator : IValidationOrchestrator
    {
        private readonly IValidationSafetyAgent _safetyAgent;

        public ValidationOrchestrator(IValidationSafetyAgent safetyAgent)
        {
            _safetyAgent = safetyAgent;
        }

        public async Task<WorkflowExecutionState> ExecuteStageAsync(
            WorkflowExecutionState state, 
            DraftApplication draft, 
            List<string>? requiredDocuments = null
        )
        {
            state.CurrentStage = "ValidationAndSafety";
            state.UpdatedAt = DateTime.UtcNow;

            // 1. Invoke Agent 4: Deterministic checks & Safety validation
            var result = await _safetyAgent.ValidateAndEnqueueAsync(draft, requiredDocuments);
            state.ValidationResult = result;

            // 2. Gateway Decision: Enforce Human-in-the-Loop Policy (§2 Project Plan)
            if (result.IsValid)
            {
                // Passed: Transition to Verifying Officer Review Queue
                state.CurrentStage = "PendingHumanApproval";
                state.HumanApprovalStatus = "AwaitingOfficerReview";
            }
            else
            {
                // Failed: Safe halt — do not pollute the human officer queue with invalid data
                state.CurrentStage = "Rejected";
                state.HumanApprovalStatus = "BlockedBySafetyAgent";
            }

            state.UpdatedAt = DateTime.UtcNow;
            return state;
        }
    }
}
