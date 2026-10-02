using AgenticAi.Services;
using Government_Service_Navigator.AgenticAi.Agents.ValidationSafety;
using Government_Service_Navigator.AgenticAi.Tools.CheckDuplicateApplication;
using Xunit;

// DuplicateCheckTool and FindAppointmentSlotTool keep static state (the duplicate registry and
// proposed slots), so test classes must not run in parallel against each other.
[assembly: CollectionBehavior(DisableTestParallelization = true)]

namespace Government_Service_Navigator.AgenticAi.Tests;

/// <summary>An LLM that always answers with a fixed string, and records what it was asked.</summary>
internal sealed class FixedLlmService : ILlmService
{
    public FixedLlmService(string? response, bool isConfigured = true)
    {
        Response = response;
        IsConfigured = isConfigured;
    }

    public string? Response { get; set; }
    public bool IsConfigured { get; }
    public string ModelName => "fixed-test-model";
    public List<string> UserPrompts { get; } = new();

    public Task<string?> GenerateChatCompletionAsync(string systemPrompt, string userPrompt, bool jsonMode = false, CancellationToken cancellationToken = default)
    {
        UserPrompts.Add(userPrompt);
        return Task.FromResult(Response);
    }
}

/// <summary>Database side of the duplicate check, answering from a fixed set of NIC + service pairs.</summary>
internal sealed class FakeDuplicateRepository : IDuplicateApplicationRepository
{
    public HashSet<(string Nic, int ServiceId)> Active { get; } = new();
    public int Calls { get; private set; }

    public Task<bool> HasDuplicateAsync(string citizenNic, int serviceProcedureId, int excludeApplicationId = 0)
    {
        Calls++;
        return Task.FromResult(Active.Contains((citizenNic.Trim(), serviceProcedureId)));
    }
}

/// <summary>Records enqueue calls and hands back increasing task ids.</summary>
internal sealed class RecordingTaskEnqueuer : IVerificationTaskEnqueuer
{
    public List<(int ApplicationId, string CitizenNic, string AgentId)> Calls { get; } = new();

    public Task<int> EnqueueTaskAsync(int applicationId, string citizenNic, string agentId)
    {
        Calls.Add((applicationId, citizenNic, agentId));
        return Task.FromResult(500 + Calls.Count);
    }
}
