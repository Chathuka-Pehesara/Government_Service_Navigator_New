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

            int serviceId = caseContext?.ServiceProcedureId ?? request.ServiceProcedureId ?? 0;
            string serviceName = caseContext?.ServiceName ?? (!string.IsNullOrWhiteSpace(request.ServiceName) ? request.ServiceName : "Government Service");
            int currentStage = caseContext?.CurrentStage ?? request.Stage ?? 1;

            IntakePlanResponse? agent1Result = null;

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

            // Generic administrative words that are shared across many services and should not falsely bias a match
            var genericServiceWords = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
            {
                "certificate", "certificat", "copy", "copi", "issuance", "issuanc",
                "registration", "registr", "renewal", "renew", "license", "licens",
                "report", "permit", "application", "service", "statutory", "official",
                "extract", "guideline", "guidelines", "procedure"
            };

            var qTokens = TextTokenizer.Tokenize(queryLower);
            var distinctiveQTokens = qTokens.Where(t => !genericServiceWords.Contains(t)).ToList();

            string? bestMatch = null;
            int bestScore = 0;

            foreach (var svc in validActiveServices)
            {
                var svcLower = svc.ToLowerInvariant();
                int score = 0;

                // 1. Exact full service name contained in the query
                if (queryLower.Contains(svcLower))
                {
                    score = 2000 + svcLower.Length;
                }
                else
                {
                    var svcTokens = TextTokenizer.Tokenize(svc);
                    var distinctiveSvcTokens = svcTokens.Where(t => !genericServiceWords.Contains(t)).ToList();

                    if (distinctiveQTokens.Count > 0)
                    {
                        // Count how many distinctive tokens match
                        int distMatch = distinctiveQTokens.Count(dq =>
                            distinctiveSvcTokens.Any(ds => ds == dq || (Math.Min(ds.Length, dq.Length) >= 4 && (ds.StartsWith(dq) || dq.StartsWith(ds)))));

                        if (distMatch > 0)
                        {
                            score = distMatch * 100 + svcTokens.Count(st => qTokens.Contains(st)) * 10;
                            if (queryLower.Contains("birth") && svcLower.Contains("birth")) score += 300;
                            if (queryLower.Contains("police") && svcLower.Contains("police")) score += 300;
                            if (queryLower.Contains("passport") && svcLower.Contains("passport")) score += 300;
                            if (queryLower.Contains("driving") && svcLower.Contains("driving")) score += 300;
                            if (queryLower.Contains("business") && svcLower.Contains("business")) score += 300;
                            if (queryLower.Contains("death") && svcLower.Contains("death")) score += 300;
                            if (queryLower.Contains("marriage") && svcLower.Contains("marriage")) score += 300;
                        }
                    }
                    else if (distinctiveSvcTokens.Count == 0 && qTokens.Count > 0)
                    {
                        int common = svcTokens.Count(st => qTokens.Contains(st));
                        if (common > 0) score = common * 10;
                    }
                }

                if (score > bestScore)
                {
                    bestScore = score;
                    bestMatch = svc;
                }
            }

            // In stateless citizen inquiry (caseContext == null), prioritize query matching:
            if (caseContext == null)
            {
                if (bestMatch != null)
                {
                    serviceName = bestMatch;
                }
                else if (distinctiveQTokens.Count > 0)
                {
                    // User explicitly asked about a distinct service not found in active catalog
                    serviceName = "Service Not Found";
                }
                else if (string.IsNullOrWhiteSpace(serviceName) || serviceName.Equals("Government Service", StringComparison.OrdinalIgnoreCase))
                {
                    // Fall back to history ONLY if query was contextual follow-up
                    if (request.History != null && request.History.Count > 0)
                    {
                        for (int i = request.History.Count - 1; i >= 0; i--)
                        {
                            var content = request.History[i].Content ?? string.Empty;
                            var contentLower = content.ToLowerInvariant();
                            var matchedInHist = validActiveServices.FirstOrDefault(s => contentLower.Contains(s.ToLowerInvariant()));
                            if (matchedInHist != null)
                            {
                                serviceName = matchedInHist;
                                break;
                            }
                        }
                    }
                }
            }
            else
            {
                // In an active submitted application (caseContext != null), keep case service unless query specifically targets another
                if (bestMatch != null && bestScore >= 1000)
                {
                    serviceName = bestMatch;
                }
            }

            // Map serviceName to database serviceId if resolved or changed
            if (!string.IsNullOrWhiteSpace(serviceName) && !serviceName.Equals("Government Service", StringComparison.OrdinalIgnoreCase) && !serviceName.Equals("Service Not Found", StringComparison.OrdinalIgnoreCase))
            {
                if (_contextProvider != null)
                {
                    try
                    {
                        var resolvedDbId = await _contextProvider.FindServiceProcedureIdAsync(serviceName, cancellationToken);
                        if (resolvedDbId.HasValue && resolvedDbId.Value > 0)
                        {
                            serviceId = resolvedDbId.Value;
                        }
                    }
                    catch { }
                }
            }

            // If still completely unresolved and user query is purely generic without context, ask citizen to pick service
            if (caseContext == null && !request.ServiceProcedureId.HasValue && serviceName.Equals("Government Service", StringComparison.OrdinalIgnoreCase))
            {
                bool isGenericInquiry = queryLower.Contains("what documents")
                    || queryLower.Contains("which documents")
                    || queryLower.Contains("documents do i need")
                    || queryLower.Contains("how much is the")
                    || queryLower.Contains("total statutory fee")
                    || queryLower.Contains("counter appointment")
                    || queryLower.Contains("eligib")
                    || queryLower.Contains("hello")
                    || queryLower.Contains("hi");

                if (isGenericInquiry && validActiveServices.Count > 1)
                {
                    string serviceListText = string.Join("\n", validActiveServices.Select(s => $"- **{s}**"));
                    return new SupervisorChatResponse
                    {
                        Answer = $"### Which service would you like guidance for?\n\n" +
                                 $"To provide you with verified statutory eligibility criteria, mandatory document checklists, and fee schedules, please specify which government service you need:\n\n" +
                                 $"{serviceListText}\n\n" +
                                 $"*You can also navigate to any service in the catalog and tap **\"Ask AI Guide\"** directly.*",
                        Tone = isWeb ? "StatutoryOfficial" : "CitizenSupportive",
                        CollaborationTrace = trace,
                        Recommendation = new SupervisorRecommendation
                        {
                            ActionType = "ExploreCatalog",
                            Title = "Select Service for Guidance",
                            Rationale = "Document requirements and eligibility rules depend on the specific government service.",
                            RiskLevel = "Low"
                        },
                        SuggestedFollowups = validActiveServices.Take(3).Select(s => $"Check eligibility for {s}").ToList(),
                        Timestamp = DateTime.UtcNow
                    };
                }
            }

            // ── Step 1: Agent 1 Intake & Procedure Discovery
            // Only prepend service name when user is in a specific active case submission
            string intakeQuery = request.Query ?? "Public service inquiry";
            if (caseContext != null && !string.IsNullOrWhiteSpace(serviceName) && !serviceName.Equals("Government Service", StringComparison.OrdinalIgnoreCase)
                && !intakeQuery.Contains(serviceName, StringComparison.OrdinalIgnoreCase))
            {
                intakeQuery = $"{serviceName} {intakeQuery}";
            }

            var intakeOutcome = await _intakeTool.ProcessIntakeAsync(intakeQuery, cancellationToken);
            trace.Add(intakeOutcome.Trace);
            agent1Result = intakeOutcome.Data;

            bool isServiceNotFound = agent1Result == null 
                || string.IsNullOrWhiteSpace(agent1Result.RecommendedService)
                || agent1Result.RecommendedService.Contains("Not Found", StringComparison.OrdinalIgnoreCase)
                || agent1Result.RecommendedService.Equals("Service Not Found", StringComparison.OrdinalIgnoreCase);

            // Fast exit when service is not available and user is not inside a fixed case submission:
            if (isServiceNotFound && caseContext == null)
            {
                string availableList = validActiveServices.Count > 0
                    ? string.Join("\n", validActiveServices.Select(s => $"- **{s}**"))
                    : "No active public services currently published.";

                string notFoundAnswer = $"### Service Not Available\n\n" +
                    $"We could not find an official statutory procedure matching your inquiry in the GovNavigator catalogue.\n\n" +
                    $"**Currently Available Services in GovNavigator:**\n" +
                    $"{availableList}\n\n" +
                    $"*Please select one of the active services above or browse the service directory.*";

                return new SupervisorChatResponse
                {
                    Answer = notFoundAnswer,
                    Tone = isWeb ? "StatutoryOfficial" : "CitizenSupportive",
                    CollaborationTrace = trace,
                    Recommendation = new SupervisorRecommendation
                    {
                        ActionType = "ExploreCatalog",
                        Title = "Service Not Available",
                        Rationale = "The requested service is not listed in the GovNavigator catalogue. Please choose from our available services.",
                        RiskLevel = "Low"
                    },
                    SuggestedFollowups = validActiveServices.Take(3).Select(s => $"How do I apply for {s}?").ToList(),
                    ServiceName = "Service Not Found",
                    ServiceProcedureId = null,
                    Timestamp = DateTime.UtcNow
                };
            }

            if (!isServiceNotFound && (string.IsNullOrWhiteSpace(serviceName) || serviceName.Equals("Government Service", StringComparison.OrdinalIgnoreCase)))
            {
                serviceName = agent1Result!.RecommendedService;
            }

            // ── Step 2: Agent 2 Statutory Eligibility & Evidentiary Document Analysis
            // Runs only when citizen explicitly asks about eligibility/documents/criteria, or for web officer verification
            EligibilityPlanResponse? agent2Result = null;
            bool checkEligibilityOrDocs = isWeb
                                         || queryLower.Contains("document") || queryLower.Contains("evidence")
                                         || queryLower.Contains("eligible") || queryLower.Contains("eligib")
                                         || queryLower.Contains("check") || queryLower.Contains("qualify") || queryLower.Contains("qualif")
                                         || queryLower.Contains("requirement") || queryLower.Contains("criteria") || queryLower.Contains("criterion")
                                         || queryLower.Contains("photo") || queryLower.Contains("receipt")
                                         || queryLower.Contains("bring") || queryLower.Contains("upload");

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

            // ── Step 3: Agent 3 Action Tools (Statutory Fee Schedule & Appointment Slot Lookup)
            // Strictly invoked only when citizen asks about fees, costs, appointments, or counter slots (or web officer)
            FeeCalculationResult? feeResult = null;
            AppointmentSlotResult? slotResult = null;
            bool checkFee = isWeb
                            || queryLower.Contains("fee") || queryLower.Contains("cost") || queryLower.Contains("pay") || queryLower.Contains("charge") || queryLower.Contains("price");

            bool checkSlot = queryLower.Contains("slot") || queryLower.Contains("appointment") || queryLower.Contains("book") || queryLower.Contains("counter") || queryLower.Contains("schedule") || queryLower.Contains("visit");

            if (checkFee)
            {
                var feeOutcome = await _actionTool.CalculateFeeAsync(serviceId, currentStage, expressProcessing: false, cancellationToken: cancellationToken);
                trace.Add(feeOutcome.Trace);
                feeResult = feeOutcome.Data;
            }

            if (checkSlot)
            {
                var slotOutcome = await _actionTool.FindAppointmentSlotAsync(serviceId, cancellationToken);
                trace.Add(slotOutcome.Trace);
                slotResult = slotOutcome.Data;
            }

            // ── Step 4: Agent 4 Safety & Duplicate Check (For Web Officers & Cases)
            DuplicateCheckOutcome? duplicateResult = null;
            bool checkDuplicateOrSafety = isWeb || queryLower.Contains("duplicate") || queryLower.Contains("safety") || queryLower.Contains("fraud") || queryLower.Contains("valid");
            if (caseContext != null && checkDuplicateOrSafety)
            {
                var safetyOutcome = await _safetyTool.AuditSafetyAndDuplicateAsync(
                    caseContext.CitizenNic,
                    serviceId,
                    caseContext.ApplicationId,
                    caseContext.CitizenAge,
                    caseContext.UploadedDocumentNames,
                    stage: currentStage,
                    cancellationToken: cancellationToken);

                trace.Add(safetyOutcome.Trace);
                duplicateResult = safetyOutcome.Data;
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
                    agent1Result,
                    agent2Result,
                    feeResult,
                    slotResult,
                    duplicateResult);
            }

            // 4. Determine Recommended Officer/Citizen Action
            if (isWeb)
            {
                bool hasMissingDocs = agent2Result?.MissingDocuments.Count > 0;
                bool hasIneligibility = agent2Result != null && (!agent2Result.IsEligible || agent2Result.MissingCriteria.Count > 0);
                bool hasAgent4Issues = trace.Any(t => t.AgentId == "agent-4" && (t.Status == "AttentionRequired" || t.Summary.Contains("SCHEMA-", StringComparison.OrdinalIgnoreCase) || t.Summary.Contains("DOC-", StringComparison.OrdinalIgnoreCase) || t.Summary.Contains("SAFETY-", StringComparison.OrdinalIgnoreCase)));
                bool isExplicitlyNonCompliant = answer.Contains("Non-compliant", StringComparison.OrdinalIgnoreCase)
                                                || answer.Contains("fails initial statutory compliance", StringComparison.OrdinalIgnoreCase)
                                                || answer.Contains("Conflict Identified", StringComparison.OrdinalIgnoreCase)
                                                || answer.Contains("Deficiency", StringComparison.OrdinalIgnoreCase)
                                                || answer.Contains("Deficiencies", StringComparison.OrdinalIgnoreCase);

                if (duplicateResult?.IsDuplicate == true)
                {
                    recommendation = new SupervisorRecommendation
                    {
                        ActionType = "Reject",
                        Title = "Investigate Duplicate Submission",
                        Rationale = $"Collision detected with existing application {duplicateResult.ExistingReference}.",
                        RiskLevel = "High"
                    };
                }
                else if (hasMissingDocs || hasIneligibility || hasAgent4Issues || isExplicitlyNonCompliant)
                {
                    var issues = new List<string>();
                    if (hasAgent4Issues)
                    {
                        var agent4Trace = trace.FirstOrDefault(t => t.AgentId == "agent-4");
                        var msg = agent4Trace != null && !string.IsNullOrWhiteSpace(agent4Trace.Summary)
                            ? agent4Trace.Summary
                            : "Safety schema or document anomaly detected";
                        issues.Add(msg);
                    }
                    if (hasMissingDocs) issues.Add($"Missing: {string.Join(", ", agent2Result!.MissingDocuments)}");
                    if (hasIneligibility) issues.Add($"Criteria: {string.Join(", ", agent2Result!.MissingCriteria)}");

                    recommendation = new SupervisorRecommendation
                    {
                        ActionType = "RequestRevision",
                        Title = "Request Evidentiary Revision",
                        Rationale = issues.Any()
                            ? string.Join("; ", issues) + "."
                            : "Application fails statutory compliance. Advise citizen to submit verified identity document and date of birth proof.",
                        RiskLevel = "Medium"
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
                if (queryLower.Contains("eligib") || queryLower.Contains("qualif") || queryLower.Contains("check") || queryLower.Contains("audit"))
                {
                    recommendation = new SupervisorRecommendation
                    {
                        ActionType = "CheckEligibility",
                        Title = "Interactive Statutory Eligibility Check",
                        Rationale = "Verify your age, citizenship status, and evidentiary documents with our interactive statutory auditor.",
                        RiskLevel = "Low"
                    };
                }
                else if (agent2Result?.MissingDocuments.Count > 0)
                {
                    recommendation = new SupervisorRecommendation
                    {
                        ActionType = "UploadDocument",
                        Title = "Upload Supporting Document",
                        Rationale = $"Please attach: {string.Join(", ", agent2Result.MissingDocuments)} to continue.",
                        RiskLevel = "Low"
                    };
                }
                else if (queryLower.Contains("appointment") || queryLower.Contains("slot") || queryLower.Contains("book"))
                {
                    if (caseContext != null)
                    {
                        bool isStageReadyForBooking = caseContext.StageStatus.Equals("Completed", StringComparison.OrdinalIgnoreCase)
                            || caseContext.StageStatus.Equals("Approved", StringComparison.OrdinalIgnoreCase)
                            || caseContext.StageStatus.Equals("ReadyForCollection", StringComparison.OrdinalIgnoreCase)
                            || caseContext.CurrentStage >= caseContext.MaxStages;

                        if (isStageReadyForBooking)
                        {
                            recommendation = new SupervisorRecommendation
                            {
                                ActionType = "BookAppointment",
                                Title = "Book Counter Appointment",
                                Rationale = slotResult != null && slotResult.IsSlotFound
                                    ? $"Your application #{caseContext.ApplicationId} has completed departmental review. Earliest available counter slot: {slotResult.LocalDisplay}."
                                    : $"Your application #{caseContext.ApplicationId} is ready for collection or counter verification. Please schedule your appointment.",
                                RiskLevel = "Low"
                            };
                        }
                        else
                        {
                            recommendation = new SupervisorRecommendation
                            {
                                ActionType = "Proceed",
                                Title = "Complete Application Verification First",
                                Rationale = $"Application #{caseContext.ApplicationId} is currently under departmental review ({caseContext.StageStatus}, Stage {caseContext.CurrentStage}/{caseContext.MaxStages}). You must complete official processing before booking a collection appointment.",
                                RiskLevel = "Low"
                            };
                        }
                    }
                    else
                    {
                        recommendation = new SupervisorRecommendation
                        {
                            ActionType = "CheckEligibility",
                            Title = "Application Required for Booking",
                            Rationale = "You must verify your eligibility and submit your application first before you can book an official counter appointment.",
                            RiskLevel = "Low"
                        };
                    }
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
                else if (caseContext != null)
                {
                    recommendation = new SupervisorRecommendation
                    {
                        ActionType = "Proceed",
                        Title = "Proceed to Next Stage",
                        Rationale = "Your application is on track and awaiting departmental review.",
                        RiskLevel = "Low"
                    };
                }
                else
                {
                    recommendation = new SupervisorRecommendation
                    {
                        ActionType = "CheckEligibility",
                        Title = "Eligibility Verification Required",
                        Rationale = "Verify your statutory criteria (age, citizenship, and evidentiary documents) before starting your application.",
                        RiskLevel = "Low"
                    };
                }
            }

            var followups = isWeb
                ? new List<string>
                {
                    "Check missing documents & age rules",
                    "Explain fee calculation for this stage",
                    "Verify duplicate applications in registry",
                    "Draft official determination remarks"
                }
                : (!string.IsNullOrWhiteSpace(serviceName) && !serviceName.Equals("Government Service", StringComparison.OrdinalIgnoreCase))
                    ? new List<string>
                    {
                        $"Am I eligible for {serviceName}?",
                        $"What are the fees for {serviceName}?",
                        $"What documents do I need for {serviceName}?",
                        $"Can I book a counter appointment for {serviceName}?"
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
                ServiceName = serviceName,
                ServiceProcedureId = serviceId,
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
                    "You are the GovNavigator Supervisor — the official administrative advisory co-pilot assisting Sri Lanka Government Verification Officers.\n" +
                    "Your role is to help the human officer quickly verify application completeness, identify any missing documents or discrepancies, and recommend clear next steps.\n\n" +
                    "COMMUNICATION DIRECTIVES FOR HUMAN OFFICERS:\n" +
                    "- Write in clear, professional, human-readable administrative English. Speak directly as an experienced government advisor.\n" +
                    "- ABSOLUTELY NO INTERNAL AI JARGON: NEVER mention internal AI architecture such as 'sub-agents', 'Agent 1', 'Agent 2', 'Agent 3', 'Agent 4', 'deterministic verification', 'cognitive AI assessment', 'semantic document interpretation', 'schema codes (like SCHEMA-AGE-002, DOC-002)', or 'algorithmic fee math'. A verification officer needs practical, plain-language facts, not system logs.\n" +
                    "- STRUCTURE CASE BRIEFINGS CLEARLY:\n" +
                    "  1. Case Overview: 1-2 sentences stating the applicant, service, and immediate status (e.g. ⚠️ Action Required — Incomplete Submission, or ✅ Ready for Determination).\n" +
                    "  2. Key Verification Findings: Clear, scannable bullet points detailing what is missing or problematic, and what was verified successfully (e.g. 'Missing Document: National Identity Card (NIC) was not uploaded', 'Data Discrepancy: Applicant age is entered as 0 years (minimum required age is 16)', 'Duplicate Check: Clean — no duplicate application found', 'Stage Statutory Fee: LKR [reconciled fee]').\n" +
                    "  3. Recommended Officer Action: 2-3 concrete, actionable steps for the officer (e.g. 'Request the applicant to upload a clear copy of their NIC (front & back)', 'Verify the applicant's date of birth before granting approval').\n" +
                    "- DIRECT ANSWERS TO QUESTIONS: When the officer asks a specific question (e.g., about fees, rules, or duplicate checks), answer directly, concisely, and practically in 1-2 paragraphs in plain terms without re-pasting system logs or internal engineering terms.\n" +
                    "- DETERMINATION INTEGRITY: If any required document is missing or any eligibility rule is violated, conclude clearly that the application CANNOT be approved yet and requires evidentiary revision. Never say all rules are satisfied when deficiencies exist.\n" +
                    "- STRICT FACTUAL GROUNDING: Rely strictly on the provided case data, verified catalog rules, and fee schedules. Never invent unverified policies or requirements.";
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

            var findingsSummary = isWeb
                ? string.Join("\n", trace.Select(t => $"- {t.Summary}"))
                : string.Join("\n", trace.Select(t => $"- [{t.AgentName}] ({t.Action}): {t.Summary}"));

            var intakeSummary = agent1 != null && agent1.RecommendedService != "Service Not Found"
                ? $"\nOFFICIAL INTAKE ROADMAP:\n- Recommended Service: {agent1.RecommendedService}\n- Mandatory Documents: {string.Join(", ", agent1.RequiredDocuments)}\n- Steps: {string.Join(" -> ", agent1.StepByStepPlan)}\n"
                : "";

            decimal activeStageFee = fee?.TotalAmount ?? 0m;
            if (activeStageFee == 0 && caseContext != null && caseContext.PaidAmount > 0)
            {
                activeStageFee = caseContext.PaidAmount;
            }

            string paymentStatusNote = caseContext != null && caseContext.PaidAmount > 0
                ? (caseContext.IsPaymentVerified ? " (Payment Confirmed)" : " (Deposit Slip Uploaded — Awaiting Finance Audit)")
                : "";

            string userPrompt;
            if (isWeb)
            {
                userPrompt =
                    $"PLATFORM: Government Verification Officer Workspace\n" +
                    $"SERVICE: {serviceName} (Stage {currentStage})\n" +
                    $"CITIZEN NIC: {caseContext?.CitizenNic ?? "N/A"} | APPLICANT: {caseContext?.CitizenName ?? "N/A"}\n" +
                    $"ACTIVE STAGE STATUTORY FEE: LKR {activeStageFee:N2}{paymentStatusNote}\n" +
                    $"VERIFICATION AUDIT FINDINGS:\n{findingsSummary}\n" +
                    intakeSummary + "\n" +
                    $"OFFICER QUERY: \"{request.Query}\"\n\n" +
                    $"Respond to the officer query adhering strictly to your human-friendly advisory directives:\n" +
                    $"- CASE OVERVIEW: State applicant name, NIC, service, and immediate status. If any document is a generic camera/WhatsApp capture needing visual audit, or payment is pending finance audit, report status as '⚠️ Action Required — Manual Document Verification & Finance Audit Required'. Never claim Ready for Approval if generic uploads or unverified payments exist.\n" +
                    $"- STATUTORY FEE: State the exact Stage Statutory Fee given above: LKR {activeStageFee:N2}{paymentStatusNote}. Never state LKR 0.00 unless the active stage fee is truly 0.00. Never say fee exemption or zero fee.\n" +
                    $"- FINDINGS: Explicitly distinguish between documents whose filenames match the requirement (e.g. NIC) and generic uploads that require officer visual verification (e.g. Birth Certificate uploaded as a camera/WhatsApp capture).\n" +
                    $"- RECOMMENDED ACTION: Provide practical, concrete next steps (e.g. '1. Visually inspect the attached file to confirm it is an authentic Birth Certificate. 2. Verify statutory fee payment of LKR {activeStageFee:N2}.').";
            }
            else
            {
                // CITIZEN MOBILE ASSISTANT:
                // Primary agent is Agent 1 (Intake & Planning Agent) grounded in Vector DB policies.
                string vectorPolicyContext = agent1 != null && agent1.RetrievedContextSnippets.Count > 0
                    ? string.Join("\n\n", agent1.RetrievedContextSnippets.Take(4))
                    : "No specific policy text retrieved.";

                string eligibilitySummary = agent2 != null
                    ? $"\nSTATUTORY ELIGIBILITY & DOCUMENT AUDIT (Agent 2):\n" +
                      $"- Eligible: {agent2.IsEligible} ({agent2.MatchPercentage}% criteria match)\n" +
                      $"- Mandatory Documents: {string.Join(", ", agent2.RequiredDocuments)}\n" +
                      $"- Missing Criteria: {(agent2.MissingCriteria.Count > 0 ? string.Join(", ", agent2.MissingCriteria) : "None")}\n" +
                      $"- Missing Documents: {(agent2.MissingDocuments.Count > 0 ? string.Join(", ", agent2.MissingDocuments) : "None")}\n" +
                      $"- Reasoning: {agent2.Reasoning}\n"
                    : "";

                userPrompt =
                    $"PLATFORM: Citizen Mobile Application (GovNavigator Service Guide)\n" +
                    $"CITIZEN QUERY: \"{request.Query}\"\n" +
                    $"IDENTIFIED SERVICE: {serviceName}\n\n" +
                    $"OFFICIAL VECTOR DATABASE POLICY CONTEXT (Agent 1 RAG Retrieval):\n" +
                    $"{vectorPolicyContext}\n\n" +
                    $"INTAKE ROADMAP FINDINGS (Agent 1):\n" +
                    $"- Step-by-Step Pathway: {(agent1 != null && agent1.StepByStepPlan.Count > 0 ? string.Join(" -> ", agent1.StepByStepPlan) : "None specified")}\n" +
                    eligibilitySummary +
                    (fee != null && fee.TotalAmount > 0 ? $"- Statutory Fee (Agent 3): {fee.Currency} {fee.TotalAmount:N2}\n" : "") +
                    (slot != null && slot.IsSlotFound ? $"- Earliest Appointment Slot (Agent 3): {slot.LocalDisplay}\n" : "") +
                    $"\nRespond directly to the CITIZEN with a warm, reassuring, and well-structured answer adhering strictly to this role division:\n" +
                    $"1. Service Availability & High-Level Rules (Agent 1): State clearly that '{serviceName}' is available in GovNavigator. Explain what the official policy circular says regarding the purpose of the service, who can apply (e.g. minimum age, citizen status), and the high-level procedural roadmap steps.\n" +
                    $"2. Document Specification Policy (Agent 1 -> Agent 2): In general inquiries, DO NOT dump the full detailed document checklist. Instead, guide the citizen to run the interactive 'Eligibility Check UI' (Agent 2) to audit their personal age, residency, and required documents.\n" +
                    $"3. Eligibility Check Inquiries (Agent 2): When the citizen asks how to check eligibility or whether they qualify:\n" +
                    $"   - Explain the official statutory criteria (e.g. minimum age requirement of 16 years, Sri Lankan citizenship/residency).\n" +
                    $"   - State clearly that they can verify their personal qualifications and evidentiary attachments interactively using our dedicated statutory auditor.\n" +
                    $"   - CRITICAL: DO NOT assume or fabricate personal applicant attributes (e.g. NEVER state 'Age 25' or declare 'You are eligible') if the citizen has not entered their profile yet. Instruct them to tap 'Launch Eligibility Check UI' below.\n" +
                    $"4. Fees & Appointment Slots (Agent 3): ONLY discuss fees or appointment slots if the citizen explicitly asked about fees, costs, appointments, or counter booking. If the citizen only asked about service availability, discovery, or roadmap, DO NOT proactively inject appointment dates or fee schedules.\n" +
                    $"5. Clean Output: DO NOT output fake markdown bracket buttons (e.g., '[Launch Eligibility Check UI]') in your text; native interactive buttons are rendered directly by the app below your message.\n" +
                    $"6. Encouragement: Reassure the citizen and invite them to tap the interactive action buttons below.";
            }

            var aiContent = await _llmService!.GenerateChatCompletionAsync(systemPrompt, userPrompt, jsonMode: false, cancellationToken);
            if (!string.IsNullOrWhiteSpace(aiContent))
            {
                return aiContent.Trim();
            }

            return GenerateFallbackSupervisorAnswer(request, isWeb, caseContext, serviceName, trace, agent1, agent2, fee, slot, dup);
        }

        private static string GenerateFallbackSupervisorAnswer(
            SupervisorChatRequest request,
            bool isWeb,
            ApplicationCaseContext? caseContext,
            string serviceName,
            List<AgentExecutionTraceItem> trace,
            IntakePlanResponse? agent1,
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
                var queryLower = (request.Query ?? string.Empty).ToLowerInvariant();

                bool isEligibilityFocused = queryLower.Contains("eligib") || queryLower.Contains("qualif") || queryLower.Contains("criteri") || queryLower.Contains("check");
                bool isFeeFocused = queryLower.Contains("fee") || queryLower.Contains("cost") || queryLower.Contains("pay") || queryLower.Contains("price");
                bool isAppointmentFocused = queryLower.Contains("slot") || queryLower.Contains("appointment") || queryLower.Contains("book") || queryLower.Contains("counter");

                // Case 1: Citizen is specifically inquiring about statutory eligibility / qualifications
                if (isEligibilityFocused)
                {
                    sb.AppendLine($"Hello! Here is the official **Statutory Eligibility Guidance** for **{serviceName}**:");
                    sb.AppendLine();

                    if (agent2 != null)
                    {
                        sb.AppendLine("🛡️ **Statutory Eligibility Assessment:**");
                        if (agent2.IsEligible)
                        {
                            sb.AppendLine($"✅ **Eligible to Apply** — Your profile satisfies the statutory eligibility criteria ({agent2.MatchPercentage}% match).");
                        }
                        else
                        {
                            sb.AppendLine($"⚠️ **Eligibility Review Required** ({agent2.MatchPercentage}% criteria match).");
                        }
                        sb.AppendLine();

                        if (agent2.MissingCriteria.Count > 0)
                        {
                            sb.AppendLine("**Statutory Criteria to Note:**");
                            foreach (var c in agent2.MissingCriteria)
                            {
                                sb.AppendLine($"- {c}");
                            }
                            sb.AppendLine();
                        }

                        if (!string.IsNullOrWhiteSpace(agent2.Reasoning))
                        {
                            sb.AppendLine($"*Policy Rule:* {agent2.Reasoning}");
                            sb.AppendLine();
                        }
                    }

                    // Mandatory Documents from Agent 2 or Agent 1
                    var docs = agent2?.RequiredDocuments.Count > 0
                        ? agent2.RequiredDocuments
                        : agent1?.RequiredDocuments;

                    if (docs != null && docs.Count > 0)
                    {
                        sb.AppendLine("📋 **Mandatory Documents Checklist:**");
                        foreach (var doc in docs)
                        {
                            sb.AppendLine($"- {doc}");
                        }
                        sb.AppendLine();
                    }

                    if (agent1 != null && agent1.RetrievedContextSnippets.Count > 0)
                    {
                        sb.AppendLine("📜 **What the Official Policy Says:**");
                        sb.AppendLine(agent1.RetrievedContextSnippets.First());
                        sb.AppendLine();
                    }

                    if (fee != null && fee.TotalAmount > 0)
                    {
                        sb.AppendLine($"💳 **Statutory Fee:** **{fee.Currency} {fee.TotalAmount:N2}**.");
                        sb.AppendLine();
                    }

                    sb.AppendLine("You can begin your application right here in the app whenever you are ready!");
                    return sb.ToString();
                }

                // Case 2: Citizen is inquiring specifically about statutory fees
                if (isFeeFocused)
                {
                    sb.AppendLine($"Hello! Here is the statutory fee schedule for **{serviceName}**:");
                    sb.AppendLine();

                    if (fee != null && fee.TotalAmount > 0)
                    {
                        sb.AppendLine($"💳 **Total Statutory Fee:** **{fee.Currency} {fee.TotalAmount:N2}**");
                        sb.AppendLine($"- Application Stage: Stage {request.Stage ?? 1}");
                        sb.AppendLine();
                    }

                    if (slot != null && slot.IsSlotFound)
                    {
                        sb.AppendLine($"📅 **Available Counter Appointments:** {slot.LocalDisplay}");
                        sb.AppendLine();
                    }

                    sb.AppendLine("Fees can be settled via official government deposit or online card payment during submission.");
                    return sb.ToString();
                }

                // Case 3: Citizen is inquiring specifically about appointment booking
                if (isAppointmentFocused)
                {
                    sb.AppendLine($"Hello! Here is the counter appointment availability for **{serviceName}**:");
                    sb.AppendLine();

                    if (slot != null && slot.IsSlotFound)
                    {
                        sb.AppendLine($"📅 **Next Available Counter Slot:** **{slot.LocalDisplay}**");
                        sb.AppendLine("- Office Hours: 09:00 - 15:00 SLT (Monday to Friday)");
                        sb.AppendLine();
                    }

                    if (fee != null && fee.TotalAmount > 0)
                    {
                        sb.AppendLine($"💳 **Statutory Fee Due at Counter:** **{fee.Currency} {fee.TotalAmount:N2}**");
                        sb.AppendLine();
                    }

                    sb.AppendLine("Please ensure all mandatory documents are brought along for physical verification.");
                    return sb.ToString();
                }

                // Case 4: General Service Guidance (Synthesizes Agent 1, Agent 2, and Agent 3)
                sb.AppendLine($"Hello! Yes, **{serviceName}** is an official service registered in the GovNavigator directory.");
                sb.AppendLine();

                if (agent1 != null && agent1.RetrievedContextSnippets.Count > 0)
                {
                    sb.AppendLine("📜 **What the Official Policy Says:**");
                    sb.AppendLine(agent1.RetrievedContextSnippets.First());
                    sb.AppendLine();
                }

                sb.AppendLine("🛡️ **Personal Eligibility & Evidentiary Verification:**");
                sb.AppendLine("Statutory eligibility depends on your age, citizenship status, and evidentiary documents. To verify your exact qualification and required attachments in real time, please tap **\"Launch Eligibility Check UI\"** below.");
                sb.AppendLine();

                if (agent1 != null && agent1.StepByStepPlan.Count > 0)
                {
                    sb.AppendLine("🗺️ **Step-by-Step Pathway:**");
                    for (int i = 0; i < agent1.StepByStepPlan.Count; i++)
                    {
                        sb.AppendLine($"{i + 1}. {agent1.StepByStepPlan[i]}");
                    }
                    sb.AppendLine();
                }

                if (fee != null && fee.TotalAmount > 0)
                {
                    sb.AppendLine($"💳 **Statutory Fee:** **{fee.Currency} {fee.TotalAmount:N2}**.");
                    sb.AppendLine();
                }

                if (slot != null && slot.IsSlotFound)
                {
                    sb.AppendLine($"📅 **Next Available Counter Slot:** {slot.LocalDisplay}.");
                    sb.AppendLine();
                }

                sb.AppendLine("You can begin your application right here in the app whenever you are ready!");
                return sb.ToString();
            }
        }
    }
}
