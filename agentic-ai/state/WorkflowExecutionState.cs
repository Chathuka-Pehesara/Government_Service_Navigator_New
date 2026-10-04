using System;
using Government_Service_Navigator.AgenticAi.Schemas;

namespace Government_Service_Navigator.AgenticAi.State
{
    public class WorkflowExecutionState
    {
        public string WorkflowId { get; set; } = Guid.NewGuid().ToString("N");
        public string WorkflowName { get; set; } = "CitizenApplicationWorkflow";
        public int ApplicationId { get; set; }
        public string CitizenNic { get; set; } = string.Empty;
        public string ServiceName { get; set; } = string.Empty;
        public int ServiceProcedureId { get; set; } = 1;
        public int CurrentStageNumber { get; set; } = 1;

        /// <summary>
        /// Pipeline Stages: "IntakeDiscovery", "EligibilityAnalysis", "DraftingPreFill", "ValidationAndSafety", 
        /// "PendingHumanApproval", "ApprovedByOfficer", "Rejected", "IneligibleRequirementGap"
        /// </summary>
        public string CurrentStage { get; set; } = "ValidationAndSafety";

        /// <summary>
        /// Tracks human officer review status (§2 human approval gateway).
        /// Options: "NotReady", "AwaitingOfficerReview", "Approved", "Rejected", "Revised"
        /// </summary>
        public string HumanApprovalStatus { get; set; } = "NotReady";

        /// <summary>
        /// Output produced by Agent 1 (Intake & Discovery Planning Agent).
        /// </summary>
        public global::AgenticAi.Agents.IntakePlanningAgent.IntakePlanResponse? IntakeResult { get; set; }

        /// <summary>
        /// Output produced by Agent 2 (Eligibility & Document Analysis Agent).
        /// </summary>
        public Government_Service_Navigator.AgenticAi.Agents.EligibilityDocumentAgent.DTOs.EligibilityPlanResponse? EligibilityResult { get; set; }

        /// <summary>
        /// Output produced by Agent 3 (Action/Tool Agent), including its tool call log.
        /// </summary>
        public Government_Service_Navigator.AgenticAi.Agents.ActionToolAgent.DTOs.ActionDraftResponse? ActionResult { get; set; }

        /// <summary>
        /// Draft application handed from Agent 3 to Agent 4.
        /// </summary>
        public DraftApplication? DraftApplication { get; set; }

        /// <summary>
        /// Output produced by Agent 4 (Validation & Safety Agent).
        /// </summary>
        public ValidationResult? ValidationResult { get; set; }

        /// <summary>
        /// Officer Dossier produced by Agent 4 in Workflow 2.
        /// </summary>
        public VerificationCaseDossier? CaseDossier { get; set; }

        /// <summary>
        /// Statutory Decision Order Draft produced by Agent 4 in Workflow 2.
        /// </summary>
        public DecisionOrderDraft? DecisionOrder { get; set; }

        /// <summary>
        /// Ordered audit trace of each sub-agent step in this workflow execution.
        /// </summary>
        public System.Collections.Generic.List<string> ExecutionTrace { get; set; } = new();

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

        public static WorkflowExecutionState Create(int applicationId, string citizenNic, string serviceName, string workflowName = "CitizenApplicationWorkflow")
        {
            return new WorkflowExecutionState
            {
                ApplicationId = applicationId,
                CitizenNic = citizenNic,
                ServiceName = serviceName,
                WorkflowName = workflowName,
                CurrentStage = "ValidationAndSafety",
                HumanApprovalStatus = "NotReady"
            };
        }
    }
}
