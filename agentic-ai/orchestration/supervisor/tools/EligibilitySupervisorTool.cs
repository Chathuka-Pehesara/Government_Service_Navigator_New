using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Government_Service_Navigator.AgenticAi.Agents.EligibilityDocumentAgent;
using Government_Service_Navigator.AgenticAi.Agents.EligibilityDocumentAgent.DTOs;
using Government_Service_Navigator.AgenticAi.Orchestration;
using Government_Service_Navigator.AgenticAi.Tools.CheckEligibilityRules;
using Government_Service_Navigator.AgenticAi.Tools.GetDocumentRequirements;

namespace Government_Service_Navigator.AgenticAi.Orchestration.Supervisor.Tools
{
    public class EligibilitySupervisorTool : IEligibilitySupervisorTool
    {
        private readonly IEligibilityDocumentAgent _agent2Eligibility;
        private readonly IGetDocumentRequirementsTool _docsTool;
        private readonly ICheckEligibilityRulesTool _rulesTool;

        public EligibilitySupervisorTool(
            IEligibilityDocumentAgent agent2Eligibility,
            IGetDocumentRequirementsTool docsTool,
            ICheckEligibilityRulesTool rulesTool)
        {
            _agent2Eligibility = agent2Eligibility;
            _docsTool = docsTool;
            _rulesTool = rulesTool;
        }

        public async Task<SupervisorToolResult<EligibilityPlanResponse>> EvaluateEligibilityAndEvidenceAsync(
            ApplicationCaseContext? caseContext,
            int serviceId,
            string serviceName,
            int stage,
            CancellationToken cancellationToken = default)
        {
            var sw = Stopwatch.StartNew();
            try
            {
                // Tool 1: Deterministic rules verification
                var age = caseContext?.CitizenAge ?? 25;
                const string citizenship = "Citizen by Descent";
                var ruleOutcome = _rulesTool.EvaluateRules(serviceId, age, citizenship);

                // Tool 2: Document requirements retrieval
                var requiredDocs = await _docsTool.GetRequiredDocumentsForServiceAsync(serviceId, stage, cancellationToken);
                var profile = new CitizenProfile
                {
                    Age = age,
                    CitizenshipStatus = citizenship,
                    ProvidedDocuments = caseContext?.UploadedDocumentNames ?? new List<string>()
                };

                var plan = await _agent2Eligibility.EvaluateEligibilityAsync(new EligibilityPlanRequest(
                    ServiceName: serviceName,
                    ServiceId: serviceId,
                    Profile: profile,
                    Stage: stage
                ), cancellationToken);

                sw.Stop();
                bool hasDocumentDiscrepancy = plan.MissingDocuments.Count > 0;

                var trace = new AgentExecutionTraceItem
                {
                    AgentId = "agent-2",
                    AgentName = "Agent 2: Statutory Eligibility & Document Intelligence",
                    Action = "evaluate_eligibility_and_evidence",
                    Status = hasDocumentDiscrepancy ? "AttentionRequired" : "Completed",
                    IsDeterministic = true,
                    LatencyMs = sw.ElapsedMilliseconds,
                    Summary = hasDocumentDiscrepancy
                        ? $"Eligibility check: {ruleOutcome.ScorePercentage}%. Missing mandatory evidentiary attachments: {string.Join(", ", plan.MissingDocuments)}"
                        : $"Statutory criteria satisfied ({ruleOutcome.ScorePercentage}%). All mandatory attachments verified."
                };

                return new SupervisorToolResult<EligibilityPlanResponse>(plan, trace, isSuccess: true);
            }
            catch (Exception ex)
            {
                sw.Stop();
                return SupervisorToolResult<EligibilityPlanResponse>.Failure(
                    "agent-2",
                    "Agent 2: Statutory Eligibility & Document Intelligence",
                    "evaluate_eligibility_and_evidence",
                    ex.Message,
                    sw.ElapsedMilliseconds);
            }
        }
    }
}
