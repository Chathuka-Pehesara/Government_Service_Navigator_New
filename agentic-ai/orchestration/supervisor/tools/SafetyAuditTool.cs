using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Threading;
using System.Threading.Tasks;
using Government_Service_Navigator.AgenticAi.Orchestration;
using Government_Service_Navigator.AgenticAi.Schemas;
using Government_Service_Navigator.AgenticAi.Tools.CheckDuplicateApplication;
using Government_Service_Navigator.AgenticAi.Tools.ValidateSchema;

namespace Government_Service_Navigator.AgenticAi.Orchestration.Supervisor.Tools
{
    public class SafetyAuditTool : ISafetyAuditTool
    {
        private readonly IDuplicateCheckTool _duplicateTool;
        private readonly ISchemaValidatorTool _schemaTool;

        public SafetyAuditTool(
            IDuplicateCheckTool duplicateTool,
            ISchemaValidatorTool schemaTool)
        {
            _duplicateTool = duplicateTool;
            _schemaTool = schemaTool;
        }

        public async Task<SupervisorToolResult<DuplicateCheckOutcome>> AuditSafetyAndDuplicateAsync(
            string citizenNic,
            int serviceId,
            int applicationId,
            CancellationToken cancellationToken = default)
        {
            var sw = Stopwatch.StartNew();
            try
            {
                // Tool 1: Check Schema & Identity integrity
                var draftStub = new DraftApplication
                {
                    ApplicationId = applicationId,
                    ServiceProcedureId = serviceId,
                    CitizenNic = citizenNic
                };
                var schemaValidation = await _schemaTool.ValidateAsync(draftStub);

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
