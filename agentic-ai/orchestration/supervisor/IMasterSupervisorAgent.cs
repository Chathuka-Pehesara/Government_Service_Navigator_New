using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace Government_Service_Navigator.AgenticAi.Orchestration
{
    /// <summary>
    /// Represents a discrete execution step performed by a sub-agent or action tool
    /// under the supervision of the Master Orchestrator.
    /// </summary>
    public class AgentExecutionTraceItem
    {
        public string AgentId { get; set; } = string.Empty; // "agent-1", "agent-2", "agent-3", "agent-4", "tool"
        public string AgentName { get; set; } = string.Empty; // e.g. "Agent 2: Statutory Eligibility & Document Intelligence"
        public string Action { get; set; } = string.Empty; // e.g. "evaluate_eligibility", "check_duplicate_application"
        public string Status { get; set; } = "Completed"; // "Completed", "AttentionRequired", "Failed", "Bypassed"
        public bool IsDeterministic { get; set; }
        public long LatencyMs { get; set; }
        public string Summary { get; set; } = string.Empty;
        public string? DetailsJson { get; set; }
        public DateTime Timestamp { get; set; } = DateTime.UtcNow;
    }

    /// <summary>
    /// Interactive question submitted by an officer (Web Workspace) or a citizen (Mobile App)
    /// to the Master Supervisor Orchestrator.
    /// </summary>
    public class SupervisorChatRequest
    {
        public string Query { get; set; } = string.Empty;
        public int? ApplicationId { get; set; }
        public int? ServiceProcedureId { get; set; }
        public int? Stage { get; set; }
        public string PlatformContext { get; set; } = "web"; // "web" (Statutory/Official) | "mobile" (Citizen/User-Friendly)
        public List<SupervisorChatMessage>? History { get; set; }
    }

    public class SupervisorChatMessage
    {
        public string Role { get; set; } = "user"; // "user", "assistant", "system"
        public string Content { get; set; } = string.Empty;
    }

    public class SupervisorRecommendation
    {
        public string ActionType { get; set; } = string.Empty; // "Approve", "RequestRevision", "Reject", "UploadDocument", "PayFee"
        public string Title { get; set; } = string.Empty;
        public string Rationale { get; set; } = string.Empty;
        public string RiskLevel { get; set; } = "Low"; // "Low", "Medium", "High", "Critical"
    }

    /// <summary>
    /// Structured response from the Master Supervisor Orchestrator.
    /// </summary>
    public class SupervisorChatResponse
    {
        public string Answer { get; set; } = string.Empty;
        public string Tone { get; set; } = "StatutoryOfficial"; // "StatutoryOfficial" | "CitizenSupportive"
        public List<AgentExecutionTraceItem> CollaborationTrace { get; set; } = new();
        public SupervisorRecommendation? Recommendation { get; set; }
        public List<string> SuggestedFollowups { get; set; } = new();
        public DateTime Timestamp { get; set; } = DateTime.UtcNow;
    }

    /// <summary>
    /// Master Orchestration Agent interface supervising the 4 autonomous sub-agents
    /// and their deterministic tools.
    /// </summary>
    public interface IMasterSupervisorAgent
    {
        /// <summary>
        /// Context-aware conversational reasoning: answers questions from officers (web) or citizens (mobile),
        /// deciding which sub-agents or specific action tools to call dynamically.
        /// </summary>
        Task<SupervisorChatResponse> ProcessChatQueryAsync(
            SupervisorChatRequest request, 
            CancellationToken cancellationToken = default);
    }
}
