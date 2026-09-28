using System;
using System.Collections.Generic;

namespace Government_Service_Navigator.AgenticAi.Schemas
{
    public record ValidationToolCall(string ToolName, string Input, string Output, DateTime CalledAt);

    public class ValidationResult
    {
        public bool IsValid { get; set; }
        public string Decision { get; set; } = string.Empty; // "EnqueuedForOfficer" or "Rejected"
        public string Summary { get; set; } = string.Empty;
        public string RiskLevel { get; set; } = "Low"; // "Low", "Medium", "High", "Critical"
        public string OfficerBriefing { get; set; } = string.Empty;
        public List<ComplianceCheckItem> ComplianceChecks { get; set; } = new();
        public List<string> RejectionReasons { get; set; } = new();
        public List<ValidationToolCall> ToolCalls { get; set; } = new();
        public Dictionary<string, string> SanitizedFormFields { get; set; } = new();
        public int? VerificationTaskId { get; set; }
        public DateTime ProcessedAt { get; set; } = DateTime.UtcNow;

        public static ValidationResult Success(
            int verificationTaskId, 
            List<ComplianceCheckItem> checks, 
            string summary = "Deterministic schema & safety checks passed. Enqueued for Verifying Officer review.",
            string riskLevel = "Low",
            string officerBriefing = "",
            List<ValidationToolCall>? toolCalls = null)
        {
            return new ValidationResult
            {
                IsValid = true,
                Decision = "EnqueuedForOfficer",
                Summary = summary,
                RiskLevel = riskLevel,
                OfficerBriefing = officerBriefing,
                ComplianceChecks = checks,
                ToolCalls = toolCalls ?? new(),
                VerificationTaskId = verificationTaskId,
                ProcessedAt = DateTime.UtcNow
            };
        }

        public static ValidationResult Rejected(
            List<string> reasons, 
            List<ComplianceCheckItem> checks, 
            string summary = "Application failed deterministic validation checks and was halted before reaching officer queue.",
            string riskLevel = "High",
            string officerBriefing = "",
            List<ValidationToolCall>? toolCalls = null)
        {
            return new ValidationResult
            {
                IsValid = false,
                Decision = "Rejected",
                Summary = summary,
                RiskLevel = riskLevel,
                OfficerBriefing = officerBriefing,
                ComplianceChecks = checks,
                RejectionReasons = reasons,
                ToolCalls = toolCalls ?? new(),
                VerificationTaskId = null,
                ProcessedAt = DateTime.UtcNow
            };
        }
    }
}
