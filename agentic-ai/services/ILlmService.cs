using System.Threading;
using System.Threading.Tasks;

namespace AgenticAi.Services;

/// <summary>
/// Abstraction for an LLM provider (Groq, OpenAI, Ollama, etc.)
/// allowing AI agents to perform cognitive reasoning, planning, and structured tool calling.
/// </summary>
public interface ILlmService
{
    bool IsConfigured { get; }
    string ModelName { get; }

    Task<string?> GenerateChatCompletionAsync(
        string systemPrompt,
        string userPrompt,
        bool jsonMode = false,
        CancellationToken cancellationToken = default);
}