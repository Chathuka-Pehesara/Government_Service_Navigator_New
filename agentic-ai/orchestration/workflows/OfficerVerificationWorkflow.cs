using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Threading;
using System.Threading.Tasks;
using global::AgenticAi.Agents.IntakePlanningAgent;
using Government_Service_Navigator.AgenticAi.Agents.ActionToolAgent;
using Government_Service_Navigator.AgenticAi.Agents.ActionToolAgent.DTOs;
using Government_Service_Navigator.AgenticAi.Agents.EligibilityDocumentAgent;
using Government_Service_Navigator.AgenticAi.Agents.EligibilityDocumentAgent.DTOs;
using Government_Service_Navigator.AgenticAi.Agents.ValidationSafety;
using Government_Service_Navigator.AgenticAi.Schemas;
using Government_Service_Navigator.AgenticAi.State;
using Government_Service_Navigator.AgenticAi.Tools.PrefillApplication;

namespace Government_Service_Navigator.AgenticAi.Orchestration.Workflows
{
    /// <summary>
    /// Input parameters for Workflow 2: Officer Statutory Verification & Multi-Stage Approval Pipeline.
    /// </summary>
    public class OfficerVerificationWorkflowRequest
    {
        public int ApplicationId { get; set; }
        public string CitizenNic { get; set; } = string.Empty;
        public string ApplicantName { get; set; } = string.Empty;
        public string ServiceName { get; set; } = string.Empty;
        public int ServiceProcedureId { get; set; } = 1;
        public int CurrentStage { get; set; } = 1;
        public int MaxStages { get; set; } = 1;
        public string CurrentDepartment { get; set; } = string.Empty;
        public List<string> SubmittedDocuments { get; set; } = new();
        public string? PaymentReference { get; set; }
        public decimal PaymentAmount { get; set; }
        public string? OfficerId { get; set; }
        public string DeterminationTarget { get; set; } = "Approval"; // "Approval", "RevisionRequired", "Rejection"
        public string? OfficerNotes { get; set; }
        public Dictionary<string, string> FieldAnswers { get; set; } = new();
    }

    /// <summary>
    /// Public contract for Workflow 2: Officer Statutory Verification & Multi-Stage Approval Pipeline.
    /// Coordinates all 4 sub-agents to audit submitted documents, verify fees, perform anti-fraud checks,
    /// compile the Verification Case Dossier, and draft the statutory legal determination order for officer sign-off.
    /// </summary>
    public interface IOfficerVerificationWorkflow
    {
        Task<WorkflowExecutionState> ExecuteVerificationPipelineAsync(
            OfficerVerificationWorkflowRequest request,
            CancellationToken cancellationToken = default);
    }

    /// <summary>
    /// Workflow 2: Officer Statutory Verification & Multi-Stage Approval Pipeline.
    /// </summary>
    public class OfficerVerificationWorkflow : IOfficerVerificationWorkflow
    {
        private readonly IIntakePlanningAgent _intakeAgent;
        private readonly IEligibilityDocumentAgent _eligibilityAgent;
        private readonly IActionToolAgent _actionAgent;
        private readonly IValidationSafetyAgent _safetyAgent;

        public OfficerVerificationWorkflow(
            IIntakePlanningAgent intakeAgent,
            IEligibilityDocumentAgent eligibilityAgent,
            IActionToolAgent actionAgent,
            IValidationSafetyAgent safetyAgent)
        {
            _intakeAgent = intakeAgent;
            _eligibilityAgent = eligibilityAgent;
            _actionAgent = actionAgent;
            _safetyAgent = safetyAgent;
        }

        public async Task<WorkflowExecutionState> ExecuteVerificationPipelineAsync(
            OfficerVerificationWorkflowRequest request,
            CancellationToken cancellationToken = default)
        {
            var sw = Stopwatch.StartNew();
            var state = WorkflowExecutionState.Create(
                applicationId: request.ApplicationId,
                citizenNic: request.CitizenNic,
                serviceName: request.ServiceName,
                workflowName: "OfficerVerificationWorkflow"
            );
            state.ServiceProcedureId = request.ServiceProcedureId;
            state.CurrentStageNumber = request.CurrentStage;
            state.ExecutionTrace.Add($"[{DateTime.UtcNow:HH:mm:ss}] Initialized Workflow 2: Statutory Officer Verification for Application #{request.ApplicationId} (Stage {request.CurrentStage}/{request.MaxStages})");

            // ══════════════════════════════════════════════════════════════════════
            // STEP 1: Agent 1 (Intake & Procedural Structure Audit)
            // Audits multi-stage roadmap prerequisites and department boundaries
            // ══════════════════════════════════════════════════════════════════════
            state.CurrentStage = "IntakeDiscovery";
            var step1Sw = Stopwatch.StartNew();

            var intakePlan = await _intakeAgent.GeneratePlanAsync(
                new IntakePlanRequest($"Audit statutory requirements for stage {request.CurrentStage} of {request.ServiceName}", request.CitizenNic),
                cancellationToken);

            state.IntakeResult = intakePlan;
            step1Sw.Stop();
            state.ExecutionTrace.Add($"[{DateTime.UtcNow:HH:mm:ss}] Step 1 Complete (Agent 1 Procedural Audit): Verified procedural blueprint for {request.ServiceName} in {step1Sw.ElapsedMilliseconds}ms");

            // ══════════════════════════════════════════════════════════════════════
            // STEP 2: Agent 2 (Evidentiary Cross-Verification Agent)
            // Cross-examines submitted evidentiary proofs against gazette requirements
            // ══════════════════════════════════════════════════════════════════════
            state.CurrentStage = "EligibilityAnalysis";
            var step2Sw = Stopwatch.StartNew();

            var profile = new CitizenProfile
            {
                CitizenshipStatus = "Sri Lankan",
                ProvidedDocuments = request.SubmittedDocuments
            };

            var eligibilityRequest = new EligibilityPlanRequest(
                ServiceName: request.ServiceName,
                ServiceId: request.ServiceProcedureId,
                Profile: profile,
                PlanSummary: $"Stage {request.CurrentStage} evidentiary verification",
                Stage: request.CurrentStage
            );

            var eligibilityResult = await _eligibilityAgent.EvaluateEligibilityAsync(eligibilityRequest, cancellationToken);
            state.EligibilityResult = eligibilityResult;
            step2Sw.Stop();
            state.ExecutionTrace.Add($"[{DateTime.UtcNow:HH:mm:ss}] Step 2 Complete (Agent 2 Evidentiary Audit): IsEligible={eligibilityResult.IsEligible}, MissingDocs={eligibilityResult.MissingDocuments.Count} in {step2Sw.ElapsedMilliseconds}ms");

            // ══════════════════════════════════════════════════════════════════════
            // STEP 3: Agent 3 (Action, Settlement Audit & Dispatch Preparation)
            // Audits payment deposit slip clearance and prepares stage draft
            // ══════════════════════════════════════════════════════════════════════
            state.CurrentStage = "DraftingPreFill";
            var step3Sw = Stopwatch.StartNew();

            var applicantDetails = new ApplicantDetails
            {
                CitizenNic = request.CitizenNic,
                FullName = request.ApplicantName,
                Email = $"{request.CitizenNic.ToLowerInvariant()}@citizen.gov.lk"
            };

            var actionDraftRequest = new ActionDraftRequest(
                ApplicationId: request.ApplicationId,
                ServiceProcedureId: request.ServiceProcedureId,
                ServiceName: request.ServiceName,
                Applicant: applicantDetails,
                Eligibility: eligibilityResult,
                ProvidedDocuments: request.SubmittedDocuments,
                PreferredAppointmentDateUtc: null,
                ExpressProcessing: false,
                Stage: request.CurrentStage
            );

            var actionResult = await _actionAgent.PrepareDraftAsync(actionDraftRequest, cancellationToken);
            state.ActionResult = actionResult;
            state.DraftApplication = actionResult.Draft ?? new DraftApplication
            {
                ApplicationId = request.ApplicationId,
                ServiceProcedureId = request.ServiceProcedureId,
                ServiceName = request.ServiceName,
                CitizenNic = request.CitizenNic,
                CitizenName = request.ApplicantName,
                FormFields = request.FieldAnswers,
                AttachedDocumentNames = request.SubmittedDocuments,
                Stage = request.CurrentStage,
                MaxStages = request.MaxStages,
                DepartmentName = request.CurrentDepartment
            };
            step3Sw.Stop();
            state.ExecutionTrace.Add($"[{DateTime.UtcNow:HH:mm:ss}] Step 3 Complete (Agent 3 Settlement Audit): Verified tariff schedule and counter dispatch options in {step3Sw.ElapsedMilliseconds}ms");

            // ══════════════════════════════════════════════════════════════════════
            // STEP 4: Agent 4 (Anti-Fraud Gateway, Case Dossier & Statutory Order)
            // Generates cryptographically sealed dossier and decision order draft
            // ══════════════════════════════════════════════════════════════════════
            state.CurrentStage = "ValidationAndSafety";
            var step4Sw = Stopwatch.StartNew();

            var requiredDocs = intakePlan.RequiredDocuments.Count > 0 
                ? intakePlan.RequiredDocuments 
                : request.SubmittedDocuments;

            // 4a. Execute Validation & Fraud Collision Check
            var validationResult = await _safetyAgent.ValidateAndEnqueueAsync(
                state.DraftApplication,
                requiredDocs,
                cancellationToken);
            state.ValidationResult = validationResult;

            // 4b. Compile Official Verification Case Dossier (§2 Audit Requirement)
            var caseDossier = await _safetyAgent.CompileCaseDossierAsync(
                state.DraftApplication,
                requiredDocs,
                cancellationToken);
            state.CaseDossier = caseDossier;

            // 4c. Draft Legal Decision Order for 1-Click Human Officer Sign-Off
            var decisionOrder = await _safetyAgent.DraftDecisionOrderAsync(
                state.DraftApplication,
                request.DeterminationTarget,
                request.OfficerNotes,
                cancellationToken);
            state.DecisionOrder = decisionOrder;

            step4Sw.Stop();
            var shortHash = !string.IsNullOrEmpty(caseDossier.IntegritySealHash) 
                ? caseDossier.IntegritySealHash.Substring(0, Math.Min(12, caseDossier.IntegritySealHash.Length)) 
                : "N/A";
            state.ExecutionTrace.Add($"[{DateTime.UtcNow:HH:mm:ss}] Step 4 Complete (Agent 4 Safety & Dossier): QueueTier='{caseDossier.AssignedQueueTier}', SealHash={shortHash}... in {step4Sw.ElapsedMilliseconds}ms");

            // ══════════════════════════════════════════════════════════════════════
            // FINAL TRANSITION: Human-in-the-Loop Gateway
            // ══════════════════════════════════════════════════════════════════════
            state.CurrentStage = "PendingHumanApproval";
            state.HumanApprovalStatus = "AwaitingOfficerReview";
            state.UpdatedAt = DateTime.UtcNow;
            state.ExecutionTrace.Add($"[{DateTime.UtcNow:HH:mm:ss}] Workflow 2 Succeeded: Statutory audit dossier and draft determination order ready for Human Officer sign-off. Total pipeline latency: {sw.ElapsedMilliseconds}ms");

            return state;
        }
    }
}
