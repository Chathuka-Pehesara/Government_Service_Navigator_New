using System;
using Government_Service_Navigator.AgenticAi.Orchestration;

namespace Government_Service_Navigator.AgenticAi.Orchestration.Supervisor.Tools
{
    /// <summary>
    /// Encapsulates the output of a specialized sub-agent tool execution along with its standardized collaboration trace item.
    /// </summary>
    /// <typeparam name="T">The strongly typed domain result returned by the sub-agent or tool.</typeparam>
    public class SupervisorToolResult<T>
    {
        public T? Data { get; init; }
        public AgentExecutionTraceItem Trace { get; init; }
        public bool IsSuccess { get; init; }
        public string? ErrorMessage { get; init; }

        public SupervisorToolResult(T? data, AgentExecutionTraceItem trace, bool isSuccess = true, string? errorMessage = null)
        {
            Data = data;
            Trace = trace;
            IsSuccess = isSuccess;
            ErrorMessage = errorMessage;
        }

        public static SupervisorToolResult<T> Failure(string agentId, string agentName, string action, string errorMessage, long latencyMs = 0)
        {
            var trace = new AgentExecutionTraceItem
            {
                AgentId = agentId,
                AgentName = agentName,
                Action = action,
                Status = "Failed",
                IsDeterministic = true,
                LatencyMs = latencyMs,
                Summary = $"Sub-agent execution error: {errorMessage}"
            };

            return new SupervisorToolResult<T>(default, trace, isSuccess: false, errorMessage: errorMessage);
        }
    }
}
