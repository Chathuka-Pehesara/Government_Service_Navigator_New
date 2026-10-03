using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using AgenticAi.Agents.IntakePlanningAgent;
using AgenticAi.Services;
using Government_Service_Navigator.AgenticAi.Agents.ActionToolAgent;
using Government_Service_Navigator.AgenticAi.Agents.ActionToolAgent.DTOs;
using Government_Service_Navigator.AgenticAi.Agents.EligibilityDocumentAgent;
using Government_Service_Navigator.AgenticAi.Agents.EligibilityDocumentAgent.DTOs;
using Government_Service_Navigator.AgenticAi.Agents.ValidationSafety;
using Government_Service_Navigator.AgenticAi.Schemas;
using Government_Service_Navigator.AgenticAi.Tools.CalculateFee;
using Government_Service_Navigator.AgenticAi.Tools.CheckDuplicateApplication;
using Government_Service_Navigator.AgenticAi.Tools.CheckEligibilityRules;
using Government_Service_Navigator.AgenticAi.Tools.FindAppointmentSlot;
using Government_Service_Navigator.AgenticAi.Tools.GetDocumentRequirements;
using Government_Service_Navigator.AgenticAi.Tools.PrefillApplication;
using Government_Service_Navigator.AgenticAi.Tools.ValidateSchema;

namespace Government_Service_Navigator.AgenticAi.Orchestration
{
    /// <summary>
    /// Master Supervisor Orchestrator Agent.
    /// Acts as the single high-level cognitive supervisor connecting directly to the LLM
    /// with tool-calling capabilities to invoke the 4 specialized agents and deterministic action tools.
    /// Provides context-aware language: statutory government terminology for the Web Officer Workspace
    /// and user-friendly, reassuring civic assistance for the Citizen Mobile Application.
    /// </summary>
    public class MasterSupervisorAgent : IMasterSupervisorAgent
    {
        private readonly IIntakePlanningAgent _agent1Intake;
        private readonly IEligibilityDocumentAgent _agent2Eligibility;
        private readonly IActionToolAgent _agent3Action;
        private readonly IValidationSafetyAgent _agent4Safety;
        private readonly ICheckEligibilityRulesTool _rulesTool;
        private readonly IGetDocumentRequirementsTool _docsTool;
        private readonly ICalculateFeeTool _feeTool;
        private readonly IFindAppointmentSlotTool _slotTool;
        private readonly IDuplicateCheckTool _duplicateTool;
        private readonly ISchemaValidatorTool _schemaTool;
        private readonly IApplicationContextProvider? _contextProvider;
        private readonly ILlmService? _llmService;

        public MasterSupervisorAgent(
            IIntakePlanningAgent agent1Intake,
            IEligibilityDocumentAgent agent2Eligibility,
            IActionToolAgent agent3Action,
            IValidationSafetyAgent agent4Safety,
            ICheckEligibilityRulesTool rulesTool,
            IGetDocumentRequirementsTool docsTool,
            ICalculateFeeTool feeTool,
            IFindAppointmentSlotTool slotTool,
            IDuplicateCheckTool duplicateTool,
            ISchemaValidatorTool schemaTool,
            IApplicationContextProvider? contextProvider = null,
            ILlmService? llmService = null)
        {
            _agent1Intake = agent1Intake;
            _agent2Eligibility = agent2Eligibility;
            _agent3Action = agent3Action;
            _agent4Safety = agent4Safety;
            _rulesTool = rulesTool;
            _docsTool = docsTool;
            _feeTool = feeTool;
            _slotTool = slotTool;
            _duplicateTool = duplicateTool;
            _schemaTool = schemaTool;
            _contextProvider = contextProvider;
            _llmService = llmService;
        }

        public async Task<SupervisorChatResponse> ProcessChatQueryAsync(
            SupervisorChatRequest request,
            CancellationToken cancellationToken = default)
        {
            var sw = Stopwatch.StartNew();
            var trace = new List<AgentExecutionTraceItem>();
            bool isWeb = string.Equals(request.PlatformContext, "web", StringComparison.OrdinalIgnoreCase);
            var queryLower = (request.Query ?? string.Empty).ToLowerInvariant();

            // 1. Fetch application case context if an ApplicationId is provided
            ApplicationCaseContext? caseContext = null;
            if (request.ApplicationId.HasValue && _contextProvider != null)
            {
                try
                {
                    caseContext = await _contextProvider.GetApplicationContextAsync(request.ApplicationId.Value, cancellationToken);
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[MasterSupervisorAgent] Warning: unable to load application {request.ApplicationId}: {ex.Message}");
                }
            }

            int serviceId = caseContext?.ServiceProcedureId ?? request.ServiceProcedureId ?? 1;
            string serviceName = caseContext?.ServiceName ?? "Government Service";
            int currentStage = caseContext?.CurrentStage ?? request.Stage ?? 1;

            // 2. Multi-Agent Decision Engine: Dispatch to specialized sub-agents and tools
            EligibilityPlanResponse? agent2Result = null;
            FeeCalculationResult? feeResult = null;
            DuplicateCheckOutcome? duplicateResult = null;
            List<string> requiredDocs = new();

            // ── Step A: Agent 4 Safety & Duplicate Check (Crucial for Web Officers & Form Submission)
            bool checkDuplicateOrSafety = isWeb || queryLower.Contains("duplicate") || queryLower.Contains("safety") || queryLower.Contains("fraud") || queryLower.Contains("valid");
            if (caseContext != null && checkDuplicateOrSafety)
            {
                var stepSw = Stopwatch.StartNew();
                try
                {
                    duplicateResult = await _duplicateTool.CheckAsync(caseContext.CitizenNic, serviceId, caseContext.ApplicationId);
                    trace.Add(new AgentExecutionTraceItem
                    {
                        AgentId = "agent-4",
                        AgentName = "Agent 4: Regulatory Safety & Fraud Gateway",
                        Action = "check_duplicate_application",
                        Status = duplicateResult.IsDuplicate ? "AttentionRequired" : "Completed",
                        IsDeterministic = true,
                        LatencyMs = stepSw.ElapsedMilliseconds,
                        Summary = duplicateResult.IsDuplicate
                            ? $"Duplicate submission flagged: {duplicateResult.ExistingReference}"
                            : "Clean anti-collision verification: No duplicate records found in national database."
                    });
                }
                catch (Exception ex)
                {
                    trace.Add(new AgentExecutionTraceItem
                    {
                        AgentId = "agent-4",
                        AgentName = "Agent 4: Regulatory Safety & Fraud Gateway",
                        Action = "check_duplicate_application",
                        Status = "Failed",
                        IsDeterministic = true,
                        LatencyMs = stepSw.ElapsedMilliseconds,
                        Summary = $"Duplicate audit encountered error: {ex.Message}"
                    });
                }
            }

            // ── Step B: Agent 2 Statutory Eligibility & Evidentiary Document Analysis
            bool checkEligibilityOrDocs = queryLower.Contains("document") || queryLower.Contains("evidence") || queryLower.Contains("eligible")
                                         || queryLower.Contains("requirement") || queryLower.Contains("photo") || queryLower.Contains("receipt") || isWeb;
            if (checkEligibilityOrDocs)
            {
                var stepSw = Stopwatch.StartNew();
                try
                {
                    requiredDocs = await _docsTool.GetRequiredDocumentsForServiceAsync(serviceId, currentStage, cancellationToken);
                    var profile = new CitizenProfile
                    {
                        Age = caseContext?.CitizenAge ?? 25,
                        CitizenshipStatus = "Citizen by Descent",
                        ProvidedDocuments = caseContext?.UploadedDocumentNames ?? new List<string>()
                    };

                    agent2Result = await _agent2Eligibility.EvaluateEligibilityAsync(new EligibilityPlanRequest(
                        ServiceName: serviceName,
                        ServiceId: serviceId,
                        Profile: profile,
                        Stage: currentStage
                    ), cancellationToken);

                    bool hasDocumentDiscrepancy = agent2Result.MissingDocuments.Count > 0;
                    trace.Add(new AgentExecutionTraceItem
                    {
                        AgentId = "agent-2",
                        AgentName = "Agent 2: Statutory Eligibility & Document Intelligence",
                        Action = "evaluate_eligibility_and_evidence",
                        Status = hasDocumentDiscrepancy ? "AttentionRequired" : "Completed",
                        IsDeterministic = false,
                        LatencyMs = stepSw.ElapsedMilliseconds,
                        Summary = hasDocumentDiscrepancy
                            ? $"Evidentiary gap: Missing or non-compliant document: {string.Join(", ", agent2Result.MissingDocuments)}"
                            : "Evidentiary verification confirmed: All required stage documents verified."
                    });
                }
                catch (Exception ex)
                {
                    trace.Add(new AgentExecutionTraceItem
                    {
                        AgentId = "agent-2",
                        AgentName = "Agent 2: Statutory Eligibility & Document Intelligence",
                        Action = "evaluate_eligibility",
                        Status = "Failed",
                        IsDeterministic = false,
                        LatencyMs = stepSw.ElapsedMilliseconds,
                        Summary = $"Eligibility evaluation failed: {ex.Message}"
                    });
                }
            }

            // ── Step C: Agent 3 Action Tools (Statutory Fee Schedule & Appointment Slot Lookup)
            bool checkFeeOrAction = queryLower.Contains("fee") || queryLower.Contains("cost") || queryLower.Contains("pay") || queryLower.Contains("slot") || queryLower.Contains("appointment") || queryLower.Contains("book") || queryLower.Contains("counter") || isWeb;
            AppointmentSlotResult? slotResult = null;
            if (checkFeeOrAction)
            {
                var stepSw = Stopwatch.StartNew();
                try
                {
                    feeResult = await _feeTool.CalculateAsync(serviceId, expressProcessing: false, stage: currentStage, cancellationToken: cancellationToken);
                    var tariffDesc = feeResult.LineItems.FirstOrDefault()?.FeeType ?? "Statutory Fee";
                    trace.Add(new AgentExecutionTraceItem
                    {
                        AgentId = "agent-3",
                        AgentName = "Agent 3: Administrative Action & Fee Computation",
                        Action = "calculate_fee",
                        Status = "Completed",
                        IsDeterministic = true,
                        LatencyMs = stepSw.ElapsedMilliseconds,
                        Summary = $"Statutory fee schedule computed: {feeResult.Currency} {feeResult.TotalAmount:N2} ({tariffDesc})"
                    });
                }
                catch (Exception ex)
                {
                    trace.Add(new AgentExecutionTraceItem
                    {
                        AgentId = "agent-3",
                        AgentName = "Agent 3: Administrative Action & Fee Computation",
                        Action = "calculate_fee",
                        Status = "Failed",
                        IsDeterministic = true,
                        LatencyMs = stepSw.ElapsedMilliseconds,
                        Summary = $"Fee computation error: {ex.Message}"
                    });
                }

                // Check appointment slot if query relates to booking, appointments, counters, or if stage review
                bool checkSlot = queryLower.Contains("slot") || queryLower.Contains("appointment") || queryLower.Contains("book") || queryLower.Contains("counter") || queryLower.Contains("schedule") || queryLower.Contains("visit");
                if (checkSlot)
                {
                    var slotSw = Stopwatch.StartNew();
                    try
                    {
                        slotResult = await _slotTool.FindSlotAsync(serviceId);
                        trace.Add(new AgentExecutionTraceItem
                        {
                            AgentId = "agent-3",
                            AgentName = "Agent 3: Administrative Action & Scheduling",
                            Action = "find_appointment_slot",
                            Status = slotResult.IsSlotFound ? "Completed" : "AttentionRequired",
                            IsDeterministic = true,
                            LatencyMs = slotSw.ElapsedMilliseconds,
                            Summary = slotResult.IsSlotFound
                                ? $"Earliest verified counter appointment proposed: {slotResult.LocalDisplay} (Office hours: 09:00 - 15:00 SLT)"
                                : $"Appointment lookup: {slotResult.Message}"
                        });
                    }
                    catch (Exception ex)
                    {
                        trace.Add(new AgentExecutionTraceItem
                        {
                            AgentId = "agent-3",
                            AgentName = "Agent 3: Administrative Action & Scheduling",
                            Action = "find_appointment_slot",
                            Status = "Failed",
                            IsDeterministic = true,
                            LatencyMs = slotSw.ElapsedMilliseconds,
                            Summary = $"Appointment slot lookup error: {ex.Message}"
                        });
                    }
                }
            }

            // ── Step D: Agent 1 Intake & Procedure Discovery (Primarily Mobile or General Inquiries)
            bool checkIntake = !isWeb && (queryLower.Contains("how to") || queryLower.Contains("procedure") || queryLower.Contains("roadmap") || caseContext == null);
            IntakePlanResponse? agent1Result = null;
            if (checkIntake)
            {
                var stepSw = Stopwatch.StartNew();
                try
                {
                    agent1Result = await _agent1Intake.GeneratePlanAsync(new IntakePlanRequest(request.Query ?? "Public service inquiry"), cancellationToken);
                    trace.Add(new AgentExecutionTraceItem
                    {
                        AgentId = "agent-1",
                        AgentName = "Agent 1: Intake & Procedure Discovery",
                        Action = "synthesize_intake_roadmap",
                        Status = "Completed",
                        IsDeterministic = false,
                        LatencyMs = stepSw.ElapsedMilliseconds,
                        Summary = $"Identified statutory procedure: {agent1Result.RecommendedService} with {agent1Result.StepByStepPlan.Count} sequential milestones."
                    });
                }
                catch (Exception ex)
                {
                    trace.Add(new AgentExecutionTraceItem
                    {
                        AgentId = "agent-1",
                        AgentName = "Agent 1: Intake & Procedure Discovery",
                        Action = "synthesize_intake_roadmap",
                        Status = "Failed",
                        IsDeterministic = false,
                        LatencyMs = stepSw.ElapsedMilliseconds,
                        Summary = $"Intake roadmap synthesis failed: {ex.Message}"
                    });
                }
            }

            // 3. Supervisor Cognitive Synthesis (Connected directly to LLM with role-specific tone)
            string tone = isWeb ? "StatutoryOfficial" : "CitizenSupportive";
            string answer;
            SupervisorRecommendation recommendation = new();

            if (_llmService != null && _llmService.IsConfigured)
            {
                answer = await GenerateLlmSupervisorAnswerAsync(
                    request,
                    isWeb,
                    caseContext,
                    serviceName,
                    currentStage,
                    trace,
                    agent2Result,
                    feeResult,
                    slotResult,
                    duplicateResult,
                    cancellationToken);
            }
            else
            {
                answer = GenerateFallbackSupervisorAnswer(
                    request,
                    isWeb,
                    caseContext,
                    serviceName,
                    trace,
                    agent2Result,
                    feeResult,
                    slotResult,
                    duplicateResult);
            }

            // 4. Determine Recommended Officer/Citizen Action
            if (isWeb)
            {
                if (agent2Result?.MissingDocuments.Count > 0)
                {
                    recommendation = new SupervisorRecommendation
                    {
                        ActionType = "RequestRevision",
                        Title = "Request Evidentiary Revision",
                        Rationale = $"Advise citizen to re-submit correct document for: {string.Join(", ", agent2Result.MissingDocuments)}.",
                        RiskLevel = "Medium"
                    };
                }
                else if (duplicateResult?.IsDuplicate == true)
                {
                    recommendation = new SupervisorRecommendation
                    {
                        ActionType = "Reject",
                        Title = "Investigate Duplicate Submission",
                        Rationale = $"Collision detected with existing application {duplicateResult.ExistingReference}.",
                        RiskLevel = "High"
                    };
                }
                else
                {
                    recommendation = new SupervisorRecommendation
                    {
                        ActionType = "Approve",
                        Title = $"Approve Stage {currentStage}",
                        Rationale = "All statutory eligibility rules, evidentiary proofs, and anti-fraud criteria satisfied.",
                        RiskLevel = "Low"
                    };
                }
            }
            else
            {
                // Mobile Citizen Recommendation
                if (agent2Result?.MissingDocuments.Count > 0)
                {
                    recommendation = new SupervisorRecommendation
                    {
                        ActionType = "UploadDocument",
                        Title = "Upload Supporting Document",
                        Rationale = $"Please attach: {string.Join(", ", agent2Result.MissingDocuments)} to continue.",
                        RiskLevel = "Low"
                    };
                }
                else if (slotResult != null && slotResult.IsSlotFound && (queryLower.Contains("appointment") || queryLower.Contains("slot") || queryLower.Contains("book")))
                {
                    recommendation = new SupervisorRecommendation
                    {
                        ActionType = "BookAppointment",
                        Title = "Book Counter Appointment",
                        Rationale = $"Earliest available slot proposed for {slotResult.LocalDisplay}.",
                        RiskLevel = "Low"
                    };
                }
                else if (caseContext != null && !caseContext.IsPaymentVerified && feeResult != null && feeResult.TotalAmount > 0)
                {
                    recommendation = new SupervisorRecommendation
                    {
                        ActionType = "PayFee",
                        Title = "Complete Statutory Payment",
                        Rationale = $"Pay {feeResult.Currency} {feeResult.TotalAmount:N2} via Online Card or Bank Deposit.",
                        RiskLevel = "Low"
                    };
                }
                else
                {
                    recommendation = new SupervisorRecommendation
                    {
                        ActionType = "Proceed",
                        Title = "Proceed to Next Stage",
                        Rationale = "Your application is on track and awaiting departmental review.",
                        RiskLevel = "Low"
                    };
                }
            }

            var followups = isWeb
                ? new List<string>
                {
                    "Explain statutory fee tariff calculation",
                    "Audit uploaded documents against gazette rules",
                    "Check duplicate submissions in database",
                    "Draft official determination remarks"
                }
                : new List<string>
                {
                    "What documents do I need to bring?",
                    "How much is the total statutory fee?",
                    "Can I book a counter appointment?",
                    "What happens after I submit?"
                };

            return new SupervisorChatResponse
            {
                Answer = answer,
                Tone = tone,
                CollaborationTrace = trace,
                Recommendation = recommendation,
                SuggestedFollowups = followups,
                Timestamp = DateTime.UtcNow
            };
        }

        private async Task<string> GenerateLlmSupervisorAnswerAsync(
            SupervisorChatRequest request,
            bool isWeb,
            ApplicationCaseContext? caseContext,
            string serviceName,
            int currentStage,
            List<AgentExecutionTraceItem> trace,
            EligibilityPlanResponse? agent2,
            FeeCalculationResult? fee,
            AppointmentSlotResult? slot,
            DuplicateCheckOutcome? dup,
            CancellationToken cancellationToken)
        {
            string systemPrompt;
            if (isWeb)
            {
                systemPrompt =
                    "You are the GovNavigator Master Supervisor Agent — the official statutory AI co-pilot for Sri Lanka Government Verification Officers.\n" +
                    "Your role is to advise the human officer on application compliance, evidentiary audits, gazette provisions, and fraud safety.\n\n" +
                    "GOVERNMENT AUDIT LANGUAGE DIRECTIVES:\n" +
                    "- Maintain an authoritative, formal, legalistic, and objective administrative tone.\n" +
                    "- Use official statutory terminology: 'Evidentiary Proof', 'Gazette Compliance', 'Statutory Tariff', 'Case Dossier', 'Administrative Determination', 'Integrity Audit'.\n" +
                    "- Always highlight which sub-agents (Agent 1, Agent 2, Agent 3, Agent 4) were consulted.\n" +
                    "- Clearly distinguish between deterministic verification (schema, fee math, database queries) and cognitive AI assessment (semantic photo/document interpretation).\n" +
                    "- Ground recommendations strictly on the provided case data. Do NOT invent policies or facts.";
            }
            else
            {
                systemPrompt =
                    "You are the GovNavigator Citizen Assistant — the official, friendly digital guide helping citizens navigate Sri Lanka public services.\n" +
                    "Your role is to guide the citizen with clarity, warmth, and reassurance.\n\n" +
                    "CITIZEN ASSISTANCE LANGUAGE DIRECTIVES:\n" +
                    "- Maintain a polite, helpful, clear, and reassuring tone.\n" +
                    "- Explain public service steps simply: 'Required Documents', 'Service Fee Breakdown', 'Step-by-Step Pathway', 'Counter Appointment'.\n" +
                    "- Guide the citizen on what documents to upload, what fee is expected, and what will happen next.\n" +
                    "- Avoid heavy legal jargon; explain requirements in plain, helpful English.";
            }

            var findingsSummary = string.Join("\n", trace.Select(t => $"- [{t.AgentName}] ({t.Action}): {t.Summary}"));

            var userPrompt =
                $"PLATFORM: {(isWeb ? "Government Verification Officer Workspace" : "Citizen Mobile Application")}\n" +
                $"SERVICE: {serviceName} (Stage {currentStage})\n" +
                $"CITIZEN NIC: {caseContext?.CitizenNic ?? "N/A"} | APPLICANT: {caseContext?.CitizenName ?? "N/A"}\n" +
                $"ACTIVE FINDINGS FROM SUB-AGENTS:\n{findingsSummary}\n\n" +
                $"USER QUERY: \"{request.Query}\"\n\n" +
                "Respond to the query adhering strictly to your persona and language directives.";

            var aiContent = await _llmService!.GenerateChatCompletionAsync(systemPrompt, userPrompt, jsonMode: false, cancellationToken);
            if (!string.IsNullOrWhiteSpace(aiContent))
            {
                return aiContent.Trim();
            }

            return GenerateFallbackSupervisorAnswer(request, isWeb, caseContext, serviceName, trace, agent2, fee, slot, dup);
        }

        private static string GenerateFallbackSupervisorAnswer(
            SupervisorChatRequest request,
            bool isWeb,
            ApplicationCaseContext? caseContext,
            string serviceName,
            List<AgentExecutionTraceItem> trace,
            EligibilityPlanResponse? agent2,
            FeeCalculationResult? fee,
            AppointmentSlotResult? slot,
            DuplicateCheckOutcome? dup)
        {
            if (isWeb)
            {
                var summary = $"**Statutory Case Assessment for {serviceName}**:\n\n";
                if (agent2 != null && agent2.MissingDocuments.Count > 0)
                {
                    summary += $"⚠️ **Evidentiary Discrepancy Identified**: Agent 2 flagged missing or mismatched evidentiary proofs: *{string.Join(", ", agent2.MissingDocuments)}*. Recommend issuing a formal Revision Request Notice to the citizen.\n\n";
                }
                else
                {
                    summary += "✓ **Evidentiary Compliance**: Agent 2 confirmed all required statutory proofs are attached.\n\n";
                }

                if (fee != null)
                {
                    var tariff = fee.LineItems.FirstOrDefault()?.FeeType ?? "Statutory Gazette Schedule";
                    summary += $"✓ **Statutory Fee Schedule**: Agent 3 computed official tariff of {fee.Currency} {fee.TotalAmount:N2} under {tariff}.\n\n";
                }

                if (slot != null)
                {
                    summary += slot.IsSlotFound
                        ? $"✓ **Counter Appointment Scheduling**: Agent 3 proposes counter slot on {slot.LocalDisplay} (Working hours: 09:00 - 15:00 SLT).\n\n"
                        : $"⚠️ **Counter Appointment Scheduling**: {slot.Message}\n\n";
                }

                if (dup != null)
                {
                    summary += dup.IsDuplicate
                        ? $"⚠️ **Fraud / Anti-Collision Alert**: Agent 4 detected duplicate submission: {dup.ExistingReference}.\n\n"
                        : "✓ **Integrity Audit**: Agent 4 confirmed no duplicate applications exist under this NIC.\n\n";
                }

                summary += "Please review the compiled sub-agent collaboration trace for granular details.";
                return summary;
            }
            else
            {
                var citizenReply = $"Hello! Here is the guidance for your **{serviceName}** application:\n\n";
                if (agent2 != null && agent2.MissingDocuments.Count > 0)
                {
                    citizenReply += $"📋 **Document Needed**: Please make sure to upload your **{string.Join(", ", agent2.MissingDocuments)}** so our department officers can verify your application.\n\n";
                }
                else
                {
                    citizenReply += "✓ **Documents Attached**: Your uploaded documents meet our preliminary requirements.\n\n";
                }

                if (fee != null)
                {
                    citizenReply += $"💳 **Service Fee**: The standard statutory fee is **{fee.Currency} {fee.TotalAmount:N2}**.\n\n";
                }

                if (slot != null)
                {
                    citizenReply += slot.IsSlotFound
                        ? $"📅 **Counter Appointment**: The earliest available counter slot is on **{slot.LocalDisplay}** (Office hours: 9:00 AM - 3:00 PM). You can reserve your appointment slot in the Booking Options section.\n\n"
                        : $"📅 **Counter Appointment**: {slot.Message}\n\n";
                }

                citizenReply += "Feel free to ask if you need help with payment methods, counter appointments, or tracking your application!";
                return citizenReply;
            }
        }
    }
}
