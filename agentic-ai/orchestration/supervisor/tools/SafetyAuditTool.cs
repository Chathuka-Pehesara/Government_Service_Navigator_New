using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Threading;
using System.Threading.Tasks;
using Government_Service_Navigator.AgenticAi.Orchestration;
using Government_Service_Navigator.AgenticAi.Schemas;
using Government_Service_Navigator.AgenticAi.Tools.CheckDuplicateApplication;
using Government_Service_Navigator.AgenticAi.Tools.ValidateSchema;

using Government_Service_Navigator.AgenticAi.Tools.GetDocumentRequirements;

namespace Government_Service_Navigator.AgenticAi.Orchestration.Supervisor.Tools
{
    public class SafetyAuditTool : ISafetyAuditTool
    {
        private readonly IDuplicateCheckTool _duplicateTool;
        private readonly ISchemaValidatorTool _schemaTool;
        private readonly IGetDocumentRequirementsTool? _docsTool;

        public SafetyAuditTool(
            IDuplicateCheckTool duplicateTool,
            ISchemaValidatorTool schemaTool,
            IGetDocumentRequirementsTool? docsTool = null)
        {
            _duplicateTool = duplicateTool;
            _schemaTool = schemaTool;
            _docsTool = docsTool;
        }

        public async Task<SupervisorToolResult<DuplicateCheckOutcome>> AuditSafetyAndDuplicateAsync(
            string citizenNic,
            int serviceId,
            int applicationId,
            int? citizenAge = null,
            List<string>? attachedDocumentNames = null,
            int? stage = null,
            List<string>? requiredDocuments = null,
            CancellationToken cancellationToken = default)
        {
            var sw = Stopwatch.StartNew();
            try
            {
                // Tool 1: Check Schema & Identity integrity with actual applicant context
                var draftStub = new DraftApplication
                {
                    ApplicationId = applicationId,
                    ServiceProcedureId = serviceId,
                    CitizenNic = citizenNic,
                    CitizenAge = citizenAge ?? 0,
                    AttachedDocumentNames = attachedDocumentNames ?? new List<string>(),
                    Stage = stage ?? 1
                };

                List<string>? neededDocs = requiredDocuments;
                if (neededDocs == null)
                {
                    if (_docsTool != null)
                    {
                        neededDocs = await _docsTool.GetRequiredDocumentsForServiceAsync(serviceId, stage, cancellationToken);
                    }
                    else if (stage.HasValue && stage.Value > 1)
                    {
                        neededDocs = new List<string>();
                    }
                }

                var schemaValidation = await _schemaTool.ValidateAsync(draftStub, neededDocs);

                // Tool 2: Check Duplicate Application (Anti-Collision / Anti-Double-Spend)
                var duplicateResult = await _duplicateTool.CheckAsync(citizenNic, serviceId, applicationId);
                sw.Stop();

                var isAttentionNeeded = duplicateResult.IsDuplicate || !schemaValidation.IsValid;
                var summary = duplicateResult.IsDuplicate
                    ? $"Duplicate submission flagged: {duplicateResult.ExistingReference}"
                    : (!schemaValidation.IsValid 
                        ? $"Schema integrity notice: {string.Join("; ", schemaValidation.Errors)}"
                        : "Clean safety audit: Schema validated & no duplicate records found in national database.");

                var trace = new AgentExecutionTraceItem
                {
                    AgentId = "agent-4",
                    AgentName = "Agent 4: Regulatory Safety & Fraud Gateway",
                    Action = "check_duplicate_application & validate_schema",
                    Status = isAttentionNeeded ? "AttentionRequired" : "Completed",
                    IsDeterministic = true,
                    LatencyMs = sw.ElapsedMilliseconds,
                    Summary = summary
                };

                return new SupervisorToolResult<DuplicateCheckOutcome>(duplicateResult, trace, isSuccess: true);
            }
            catch (Exception ex)
            {
                sw.Stop();
                return SupervisorToolResult<DuplicateCheckOutcome>.Failure(
                    "agent-4",
                    "Agent 4: Regulatory Safety & Fraud Gateway",
                    "safety_audit",
                    ex.Message,
                    sw.ElapsedMilliseconds);
            }
        }
    }
}
