using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using AgenticAi.Agents.IntakePlanningAgent;
using AgenticAi.Services;
using Government_Service_Navigator.AgenticAi.Agents.EligibilityDocumentAgent.DTOs;
using Government_Service_Navigator.AgenticAi.Orchestration.Supervisor.Tools;
using Government_Service_Navigator.AgenticAi.Tools.CalculateFee;
using Government_Service_Navigator.AgenticAi.Tools.CheckDuplicateApplication;
using Government_Service_Navigator.AgenticAi.Tools.FindAppointmentSlot;

namespace Government_Service_Navigator.AgenticAi.Orchestration
{
    /// <summary>
    /// Master Supervisor Agent: The central cognitive orchestrator.
    /// Coordinates 4 dedicated sub-agent delegate tools (Agent 1, Agent 2, Agent 3, Agent 4)
    /// to synthesize statutory compliance, fee computation, safety screening, and LLM reasoning.
    /// </summary>
    public class MasterSupervisorAgent : IMasterSupervisorAgent
    {
        private readonly IIntakeSupervisorTool _intakeTool;
        private readonly IEligibilitySupervisorTool _eligibilityTool;
        private readonly IAdministrativeActionTool _actionTool;
        private readonly ISafetyAuditTool _safetyTool;
        private readonly IApplicationContextProvider? _contextProvider;
        private readonly ILlmService? _llmService;

        public MasterSupervisorAgent(
            IIntakeSupervisorTool intakeTool,
            IEligibilitySupervisorTool eligibilityTool,
            IAdministrativeActionTool actionTool,
            ISafetyAuditTool safetyTool,
            IApplicationContextProvider? contextProvider = null,
            ILlmService? llmService = null)
        {
            _intakeTool = intakeTool;
            _eligibilityTool = eligibilityTool;
            _actionTool = actionTool;
            _safetyTool = safetyTool;
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
                catch
                {
                    // Fallback to stateless inquiry if context lookup fails
                }
            }

            int serviceId = caseContext?.ServiceProcedureId ?? request.ServiceProcedureId ?? 1;
            string serviceName = caseContext?.ServiceName ?? (!string.IsNullOrWhiteSpace(request.ServiceName) ? request.ServiceName : "Government Service");
            int currentStage = caseContext?.CurrentStage ?? request.Stage ?? 1;

            IntakePlanResponse? agent1Result = null;

            // ── Pre-Step: If inquiring generally without an active application AND without a specific service pre-selected
            if (caseContext == null && !request.ServiceProcedureId.HasValue)
            {
                bool isGenericInquiry = queryLower.Contains("what documents")
                    || queryLower.Contains("which documents")
                    || queryLower.Contains("documents do i need")
                    || queryLower.Contains("how much is the")
                    || queryLower.Contains("total statutory fee")
                    || queryLower.Contains("counter appointment")
                    || queryLower.Contains("what happens after");

                bool mentionsService = queryLower.Contains("passport") || queryLower.Contains("nic") || queryLower.Contains("identity")
                    || queryLower.Contains("license") || queryLower.Contains("licence") || queryLower.Contains("birth")
                    || queryLower.Contains("marriage") || queryLower.Contains("certificate") || queryLower.Contains("vehicle");

                if (isGenericInquiry && !mentionsService)
                {
                    List<string> availableServices = new();
                    if (_contextProvider != null)
                    {
                        try
                        {
                            availableServices = await _contextProvider.GetAvailableServiceNamesAsync(cancellationToken);
                        }
                        catch
                        {
                            availableServices = new List<string>();
                        }
                    }

                    var validServices = availableServices
                        .Where(s => !s.StartsWith("test", StringComparison.OrdinalIgnoreCase) && !s.Contains("testing", StringComparison.OrdinalIgnoreCase))
                        .ToList();

                    string serviceListText = validServices.Any()
                        ? string.Join("\n", validServices.Select(s => $"- **{s}**"))
                        : "- **National Identity Card (NIC) Issuance**\n- **Passport Renewal / Application**\n- **Driving License Examination & Renewal**";

                    return new SupervisorChatResponse
                    {
                        Answer = $"### Which service would you like guidance for?\n\n" +
                                 $"To provide you with the exact mandatory documents, statutory eligibility criteria, and fee schedules, please specify which government service you need:\n\n" +
                                 $"{serviceListText}\n\n" +
                                 $"*You can also navigate to any service in the catalog and tap **\"Ask AI Guide\"** or **\"Audit Eligibility\"** directly.*",
                        Tone = isWeb ? "StatutoryOfficial" : "CitizenSupportive",
                        CollaborationTrace = trace,
                        Recommendation = new SupervisorRecommendation
                        {
                            ActionType = "ExploreCatalog",
                            Title = "Select Service for Document Checklist",
                            Rationale = "Document requirements and eligibility rules depend on the specific government service.",
                            RiskLevel = "Low"
                        },
                        SuggestedFollowups = validServices.Any()
                            ? validServices.Take(3).Select(s => $"What documents for {s}?").ToList()
                            : new List<string>
                            {
                                "What documents for Passport Renewal?",
                                "What documents for National Identity Card?",
                                "What documents for Driving License?"
                            },
                        Timestamp = DateTime.UtcNow
                    };
                }

                var intakeOutcome = await _intakeTool.ProcessIntakeAsync(request.Query ?? "Public service inquiry", cancellationToken);
                trace.Add(intakeOutcome.Trace);
                agent1Result = intakeOutcome.Data;

                if (agent1Result != null)
                {
                    bool isNotFound = string.IsNullOrWhiteSpace(agent1Result.RecommendedService)
                        || agent1Result.RecommendedService.Equals("Service Not Found", StringComparison.OrdinalIgnoreCase)
                        || agent1Result.RecommendedService.Contains("Not Found", StringComparison.OrdinalIgnoreCase);

                    if (isNotFound)
                    {
                        List<string> availableServices = new();
                        if (_contextProvider != null)
                        {
                            try
                            {
                                availableServices = await _contextProvider.GetAvailableServiceNamesAsync(cancellationToken);
                            }
                            catch
                            {
                                availableServices = new List<string>();
                            }
                        }

                        var validActiveServices = availableServices
                            .Where(s => !s.StartsWith("test", StringComparison.OrdinalIgnoreCase) && !s.Contains("testing", StringComparison.OrdinalIgnoreCase))
                            .ToList();

                        string servicesSection = validActiveServices.Any()
                            ? $"**Officially Supported Services in our Registry:**\n{string.Join("\n", validActiveServices.Select(s => $"- {s}"))}\n\n"
                            : string.Empty;

                        string notFoundAnswer = isWeb
                            ? $"### Service Policy Not Registered\n\n" +
                              $"The inquiry query: *\"{request.Query}\"* does not correspond to any active statutory policy circular in the vector knowledge base.\n\n" +
                              servicesSection +
                              $"**Administrative Guidance:**\n" +
                              $"- Procedural guidance requires an active, gazetted policy circular registered in the vector database.\n" +
                              $"- Departmental administrators can ingest official service circulars via the Service Catalog configuration panel."
                            : $"### Official Policy Not Found\n\n" +
                              $"I could not locate an official policy, procedure, or document rules for **\"{request.Query}\"** in the GovNavigator knowledge base.\n\n" +
                              servicesSection +
                              $"**Official Notice:**\n" +
                              $"- Our digital assistants provide guidance verified strictly against official policy circulars registered in the system.\n" +
                              $"- Because this service does not yet have an active policy registered in the database, automated document requirements and fee breakdowns cannot be generated.\n\n" +
                              $"**What you can do:**\n" +
                              $"- For immediate assistance, please visit the relevant issuing department or local Divisional Secretariat.\n" +
                              $"- Check back soon as more government service policies are actively onboarded.";

                        return new SupervisorChatResponse
                        {
                            Answer = notFoundAnswer,
                            Tone = isWeb ? "StatutoryOfficial" : "CitizenSupportive",
                            CollaborationTrace = trace,
                            Recommendation = new SupervisorRecommendation
                            {
                                ActionType = "ExploreCatalog",
                                Title = "Policy Not Yet Registered",
                                Rationale = "Official policy documentation has not yet been onboarded for this service.",
                                RiskLevel = "Low"
                            },
                            SuggestedFollowups = validActiveServices.Any()
                                ? validActiveServices.Take(3).Select(s => $"How do I apply for {s}?").ToList()
                                : new List<string>
                                {
                                    "Where can I find counter contact details?",
                                    "Check available digital services"
                                },
                            Timestamp = DateTime.UtcNow
                        };
                    }
                    else
                    {
                        serviceName = agent1Result.RecommendedService;
                    }
                }
                else
                {
                    // agent1Result is null (no policy found)
                    return new SupervisorChatResponse
                    {
                        Answer = $"### Official Policy Not Found\n\n" +
                                 $"I could not locate official policy rules or procedures for **\"{request.Query}\"** in the GovNavigator knowledge base.\n\n" +
                                 $"Guidance can only be provided when verified statutory policies exist in the database.",
                        Tone = isWeb ? "StatutoryOfficial" : "CitizenSupportive",
                        CollaborationTrace = trace,
                        Recommendation = new SupervisorRecommendation
                        {
                            ActionType = "ExploreCatalog",
                            Title = "Policy Not Yet Registered",
                            Rationale = "No policy document found in the knowledge base.",
                            RiskLevel = "Low"
                        },
                        SuggestedFollowups = new List<string> { "Check available digital services" },
                        Timestamp = DateTime.UtcNow
                    };
                }
            }

            // 2. Multi-Agent Decision Engine: Dispatch to specialized delegate tools
            EligibilityPlanResponse? agent2Result = null;
            FeeCalculationResult? feeResult = null;
            DuplicateCheckOutcome? duplicateResult = null;

            // ── Step A: Agent 4 Safety & Duplicate Check (Crucial for Web Officers & Form Submission)
            bool checkDuplicateOrSafety = isWeb || queryLower.Contains("duplicate") || queryLower.Contains("safety") || queryLower.Contains("fraud") || queryLower.Contains("valid");
            if (caseContext != null && checkDuplicateOrSafety)
            {
                var safetyOutcome = await _safetyTool.AuditSafetyAndDuplicateAsync(
                    caseContext.CitizenNic,
                    serviceId,
                    caseContext.ApplicationId,
                    cancellationToken);

                trace.Add(safetyOutcome.Trace);
                duplicateResult = safetyOutcome.Data;
            }

            // ── Step B: Agent 2 Statutory Eligibility & Evidentiary Document Analysis
            bool checkEligibilityOrDocs = queryLower.Contains("document") || queryLower.Contains("evidence") || queryLower.Contains("eligible")
                                         || queryLower.Contains("requirement") || queryLower.Contains("photo") || queryLower.Contains("receipt") || isWeb;
            if (checkEligibilityOrDocs)
            {
                var eligibilityOutcome = await _eligibilityTool.EvaluateEligibilityAndEvidenceAsync(
                    caseContext,
                    serviceId,
                    serviceName,
                    currentStage,
                    cancellationToken);

                trace.Add(eligibilityOutcome.Trace);
                agent2Result = eligibilityOutcome.Data;
            }

            // ── Step C: Agent 3 Action Tools (Statutory Fee Schedule & Appointment Slot Lookup)
            bool checkFeeOrAction = queryLower.Contains("fee") || queryLower.Contains("cost") || queryLower.Contains("pay") || queryLower.Contains("slot") || queryLower.Contains("appointment") || queryLower.Contains("book") || queryLower.Contains("counter") || isWeb;
            AppointmentSlotResult? slotResult = null;
            if (checkFeeOrAction)
            {
                var feeOutcome = await _actionTool.CalculateFeeAsync(serviceId, currentStage, expressProcessing: false, cancellationToken: cancellationToken);
                trace.Add(feeOutcome.Trace);
                feeResult = feeOutcome.Data;

                bool checkSlot = queryLower.Contains("slot") || queryLower.Contains("appointment") || queryLower.Contains("book") || queryLower.Contains("counter") || queryLower.Contains("schedule") || queryLower.Contains("visit");
                if (checkSlot)
                {
                    var slotOutcome = await _actionTool.FindAppointmentSlotAsync(serviceId, cancellationToken);
                    trace.Add(slotOutcome.Trace);
                    slotResult = slotOutcome.Data;
                }
            }

            // ── Step D: Agent 1 Intake & Procedure Discovery (If not already evaluated in Pre-Step)
            bool checkIntake = agent1Result == null && !isWeb && (queryLower.Contains("how to") || queryLower.Contains("procedure") || queryLower.Contains("roadmap"));
            if (checkIntake)
            {
                var intakeOutcome = await _intakeTool.ProcessIntakeAsync(request.Query ?? "Public service inquiry", cancellationToken);
                trace.Add(intakeOutcome.Trace);
                agent1Result = intakeOutcome.Data;
            }

            // 3. Supervisor Cognitive Synthesis (Role-specific tone & strict grounding)
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
                    agent1Result,
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
            IntakePlanResponse? agent1,
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
                    "- Avoid heavy legal jargon; explain requirements in plain, helpful English.\n" +
                    "- STRICT FACTUAL GROUNDING: Ground all requirements, documents, and fees strictly on the sub-agent findings and verified catalog context.\n" +
                    "- NO HALLUCINATION RULE: Agent 1's role is strictly limited to providing guidelines verified against policies in the vector database. If Agent 1 or the sub-agents have not verified a statutory policy for this inquiry, DO NOT invent, assume, or hallucinate document checklists, fee schedules, or steps. State clearly that no policy exists in the database.";
            }

            var findingsSummary = string.Join("\n", trace.Select(t => $"- [{t.AgentName}] ({t.Action}): {t.Summary}"));

            var intakeSummary = agent1 != null && agent1.RecommendedService != "Service Not Found"
                ? $"\nOFFICIAL INTAKE ROADMAP (Agent 1):\n- Recommended Service: {agent1.RecommendedService}\n- Mandatory Documents: {string.Join(", ", agent1.RequiredDocuments)}\n- Steps: {string.Join(" -> ", agent1.StepByStepPlan)}\n"
                : "";

            var userPrompt =
                $"PLATFORM: {(isWeb ? "Government Verification Officer Workspace" : "Citizen Mobile Application")}\n" +
                $"SERVICE: {serviceName} (Stage {currentStage})\n" +
                $"CITIZEN NIC: {caseContext?.CitizenNic ?? "N/A"} | APPLICANT: {caseContext?.CitizenName ?? "N/A"}\n" +
                $"ACTIVE FINDINGS FROM SUB-AGENTS:\n{findingsSummary}\n" +
                intakeSummary + "\n" +
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
                var sb = new System.Text.StringBuilder();
                sb.AppendLine($"### Administrative Evidentiary Audit: {serviceName}");
                sb.AppendLine();
                sb.AppendLine("**Statutory Findings Summary:**");

                if (dup?.IsDuplicate == true)
                {
                    sb.AppendLine($"- ⚠️ **Collision Flagged:** Existing submission {dup.ExistingReference} matches applicant NIC. Potential duplicate.");
                }
                else
                {
                    sb.AppendLine("- ✅ **Anti-Collision:** Clean status. No duplicate active application found.");
                }

                if (agent2 != null)
                {
                    if (agent2.MissingDocuments.Count > 0)
                    {
                        sb.AppendLine($"- ⚠️ **Evidentiary Gap:** Missing {string.Join(", ", agent2.MissingDocuments)}.");
                    }
                    else
                    {
                        sb.AppendLine("- ✅ **Evidentiary Proofs:** All stage documents conform to gazette criteria.");
                    }
                }

                if (fee != null)
                {
                    sb.AppendLine($"- 🏛️ **Statutory Tariff:** {fee.Currency} {fee.TotalAmount:N2} computed based on legal fee schedules.");
                }

                sb.AppendLine();
                sb.AppendLine("**Administrative Recommendation:** Review flagged evidence in the dossier gallery above before committing an official determination order.");
                return sb.ToString();
            }
            else
            {
                var sb = new System.Text.StringBuilder();
                sb.AppendLine($"Hello {caseContext?.CitizenName ?? "Citizen"}! Here is the official status and guidance for your **{serviceName}** application:");
                sb.AppendLine();

                if (agent2 != null && agent2.MissingDocuments.Count > 0)
                {
                    sb.AppendLine($"📄 **Action Required:** Please attach or re-upload: **{string.Join(", ", agent2.MissingDocuments)}**.");
                }
                else
                {
                    sb.AppendLine("📄 **Documents:** All submitted documents for this stage are in order.");
                }

                if (fee != null)
                {
                    sb.AppendLine($"💳 **Statutory Fee:** **{fee.Currency} {fee.TotalAmount:N2}**.");
                }

                if (slot != null && slot.IsSlotFound)
                {
                    sb.AppendLine($"📅 **Next Available Appointment:** {slot.LocalDisplay}.");
                }

                sb.AppendLine();
                sb.AppendLine("We are here to assist you through every milestone. Feel free to ask any questions!");
                return sb.ToString();
            }
        }
    }
}
