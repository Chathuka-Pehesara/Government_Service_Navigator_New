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
    /// Input parameters for Workflow 1: Citizen Pre-Application & Submission Pipeline.
    /// </summary>
    public class CitizenApplicationWorkflowRequest
    {
        public string UserNeedDescription { get; set; } = string.Empty;
        public string CitizenNic { get; set; } = string.Empty;
        public string CitizenName { get; set; } = string.Empty;
        public int Age { get; set; } = 25;
        public string CitizenshipStatus { get; set; } = "Sri Lankan";
        public string EmploymentStatus { get; set; } = "Employed";
        public decimal AnnualIncome { get; set; } = 500000;
        public List<string> ProvidedDocuments { get; set; } = new();
        public int? ServiceProcedureId { get; set; }
        public DateTime? PreferredAppointmentDateUtc { get; set; }
        public Dictionary<string, string> FormFields { get; set; } = new();
    }

    /// <summary>
    /// Public contract for Workflow 1: Coordinates all 4 sub-agents in sequential handoff
    /// (Agent 1 Intake -> Agent 2 Eligibility -> Agent 3 Drafting -> Agent 4 Safety & Enqueue).
    /// </summary>
    public interface ICitizenApplicationWorkflow
    {
        Task<WorkflowExecutionState> ExecutePipelineAsync(
            CitizenApplicationWorkflowRequest request,
            CancellationToken cancellationToken = default);
    }

    /// <summary>
    /// Workflow 1: Citizen Pre-Application & Submission Pipeline.
    /// Coordinates the 4 specialized agents so that each agent's output feeds directly
    /// into the next agent's input until the application is ready for human verification.
    /// </summary>
    public class CitizenApplicationWorkflow : ICitizenApplicationWorkflow
    {
        private readonly IIntakePlanningAgent _intakeAgent;
        private readonly IEligibilityDocumentAgent _eligibilityAgent;
        private readonly IActionToolAgent _actionAgent;
        private readonly IValidationSafetyAgent _safetyAgent;

        public CitizenApplicationWorkflow(
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

        public async Task<WorkflowExecutionState> ExecutePipelineAsync(
            CitizenApplicationWorkflowRequest request,
            CancellationToken cancellationToken = default)
        {
            var sw = Stopwatch.StartNew();
            var state = WorkflowExecutionState.Create(
                applicationId: 0,
                citizenNic: request.CitizenNic,
                serviceName: "Processing...",
                workflowName: "CitizenApplicationWorkflow"
            );
            state.ExecutionTrace.Add($"[{DateTime.UtcNow:HH:mm:ss}] Initialized Workflow 1: Citizen Pre-Application Pipeline for NIC: {request.CitizenNic}");

            // ══════════════════════════════════════════════════════════════════════
            // STEP 1: Agent 1 (Intake & Discovery Planning Agent)
            // Analyzes user plain-language query to discover service & required docs
            // ══════════════════════════════════════════════════════════════════════
            state.CurrentStage = "IntakeDiscovery";
            var step1Sw = Stopwatch.StartNew();

            var intakePlan = await _intakeAgent.GeneratePlanAsync(
                new IntakePlanRequest(request.UserNeedDescription, request.CitizenNic),
                cancellationToken);

            state.IntakeResult = intakePlan;
            state.ServiceName = intakePlan.RecommendedService;
            state.ServiceProcedureId = request.ServiceProcedureId ?? 1;
            step1Sw.Stop();
            state.ExecutionTrace.Add($"[{DateTime.UtcNow:HH:mm:ss}] Step 1 Complete (Agent 1 Intake): Matched service '{state.ServiceName}' with {intakePlan.RequiredDocuments.Count} required docs in {step1Sw.ElapsedMilliseconds}ms");

            // ══════════════════════════════════════════════════════════════════════
            // STEP 2: Agent 2 (Eligibility & Evidentiary Proofs Agent)
            // Feeds Agent 1's service & required docs into statutory gazette audit
            // ══════════════════════════════════════════════════════════════════════
            state.CurrentStage = "EligibilityAnalysis";
            var step2Sw = Stopwatch.StartNew();

            var profile = new CitizenProfile
            {
                Age = request.Age,
                CitizenshipStatus = request.CitizenshipStatus,
                EmploymentStatus = request.EmploymentStatus,
                AnnualIncome = request.AnnualIncome,
                ProvidedDocuments = request.ProvidedDocuments.Count > 0 
                    ? request.ProvidedDocuments 
                    : new List<string>()
            };

            var eligibilityRequest = new EligibilityPlanRequest(
                ServiceName: state.ServiceName,
                ServiceId: state.ServiceProcedureId,
                Profile: profile,
                PlanSummary: string.Join("; ", intakePlan.StepByStepPlan),
                Stage: 1
            );

            var eligibilityResult = await _eligibilityAgent.EvaluateEligibilityAsync(eligibilityRequest, cancellationToken);
            state.EligibilityResult = eligibilityResult;
            step2Sw.Stop();
            state.ExecutionTrace.Add($"[{DateTime.UtcNow:HH:mm:ss}] Step 2 Complete (Agent 2 Eligibility): IsEligible={eligibilityResult.IsEligible}, Match={eligibilityResult.MatchPercentage}% in {step2Sw.ElapsedMilliseconds}ms");

            // If statutory criteria fail completely, record gap and transition state
            if (!eligibilityResult.IsEligible && eligibilityResult.MatchPercentage < 30)
            {
                state.CurrentStage = "IneligibleRequirementGap";
                state.HumanApprovalStatus = "IneligibleByStatute";
                state.UpdatedAt = DateTime.UtcNow;
                state.ExecutionTrace.Add($"[{DateTime.UtcNow:HH:mm:ss}] Workflow halted early: Citizen does not meet gazette statutory eligibility criteria ({string.Join(", ", eligibilityResult.MissingCriteria)}).");
                return state;
            }

            // ══════════════════════════════════════════════════════════════════════
            // STEP 3: Agent 3 (Action & Pre-Fill Agent)
            // Feeds Agent 1 & Agent 2 outputs into drafting, tariff computation & booking
            // ══════════════════════════════════════════════════════════════════════
            state.CurrentStage = "DraftingPreFill";
            var step3Sw = Stopwatch.StartNew();

            var applicantDetails = new ApplicantDetails
            {
                CitizenNic = request.CitizenNic,
                FullName = !string.IsNullOrWhiteSpace(request.CitizenName) ? request.CitizenName : "Applicant",
                Email = $"{request.CitizenNic.ToLowerInvariant()}@citizen.gov.lk",
                Age = request.Age,
                CitizenshipStatus = request.CitizenshipStatus,
                EmploymentStatus = request.EmploymentStatus,
                AnnualIncome = request.AnnualIncome
            };

            var actionDraftRequest = new ActionDraftRequest(
                ApplicationId: 0,
                ServiceProcedureId: state.ServiceProcedureId,
                ServiceName: state.ServiceName,
                Applicant: applicantDetails,
                Eligibility: eligibilityResult,
                ProvidedDocuments: request.ProvidedDocuments,
                PreferredAppointmentDateUtc: request.PreferredAppointmentDateUtc,
                ExpressProcessing: false,
                Stage: 1
            );

            var actionResult = await _actionAgent.PrepareDraftAsync(actionDraftRequest, cancellationToken);
            state.ActionResult = actionResult;
            state.DraftApplication = actionResult.Draft;
            step3Sw.Stop();
            state.ExecutionTrace.Add($"[{DateTime.UtcNow:HH:mm:ss}] Step 3 Complete (Agent 3 Action): Pre-filled application draft, statutory fee calculated: LKR {actionResult.Draft?.CalculatedFee ?? 0} in {step3Sw.ElapsedMilliseconds}ms");

            // ══════════════════════════════════════════════════════════════════════
            // STEP 4: Agent 4 (Validation, Anti-Fraud & Pre-Submission Safety Gate)
            // Feeds Agent 3's DraftApplication into schema & anti-fraud gatekeeper
            // ══════════════════════════════════════════════════════════════════════
            state.CurrentStage = "ValidationAndSafety";
            var step4Sw = Stopwatch.StartNew();

            var effectiveDraft = state.DraftApplication ?? new DraftApplication
            {
                ApplicationId = state.ApplicationId,
                ServiceProcedureId = state.ServiceProcedureId,
                ServiceName = state.ServiceName,
                CitizenNic = request.CitizenNic,
                CitizenName = request.CitizenName,
                FormFields = request.FormFields,
                AttachedDocumentNames = request.ProvidedDocuments
            };

            var requiredDocsList = intakePlan.RequiredDocuments.Count > 0 
                ? intakePlan.RequiredDocuments 
                : request.ProvidedDocuments;

            var validationResult = await _safetyAgent.ValidateAndEnqueueAsync(
                effectiveDraft,
                requiredDocsList,
                cancellationToken);

            state.ValidationResult = validationResult;
            step4Sw.Stop();
            state.ExecutionTrace.Add($"[{DateTime.UtcNow:HH:mm:ss}] Step 4 Complete (Agent 4 Safety): IsValid={validationResult.IsValid}, RiskLevel={validationResult.RiskLevel} in {step4Sw.ElapsedMilliseconds}ms");

            // ══════════════════════════════════════════════════════════════════════
            // FINAL TRANSITION: Enforce Human-in-the-Loop Gateway
            // ══════════════════════════════════════════════════════════════════════
            if (validationResult.IsValid)
            {
                state.CurrentStage = "PendingHumanApproval";
                state.HumanApprovalStatus = "AwaitingOfficerReview";
                state.ExecutionTrace.Add($"[{DateTime.UtcNow:HH:mm:ss}] Workflow 1 Succeeded: Application enqueued for statutory officer review. Total pipeline latency: {sw.ElapsedMilliseconds}ms");
            }
            else
            {
                state.CurrentStage = "Rejected";
                state.HumanApprovalStatus = "BlockedBySafetyAgent";
                state.ExecutionTrace.Add($"[{DateTime.UtcNow:HH:mm:ss}] Workflow 1 Blocked: Safety gate identified defects [{string.Join(", ", validationResult.RejectionReasons)}].");
            }

            state.UpdatedAt = DateTime.UtcNow;
            return state;
        }
    }
}
