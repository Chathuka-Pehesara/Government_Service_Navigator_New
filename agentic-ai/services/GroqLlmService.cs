using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace AgenticAi.Services;

/// <summary>
/// Client implementation for Groq Cloud LLM API.
/// Connects to Groq's high-speed inference engine using standard OpenAI-compatible endpoints.
/// </summary>
public class GroqLlmService : ILlmService
{
    private const string DefaultEndpoint = "https://api.groq.com/openai/v1/chat/completions";
    private const string DefaultModel = "openai/gpt-oss-120b";

    private readonly HttpClient _httpClient;
    private readonly string? _apiKey;
    private readonly string _model;
    private readonly string _endpoint;

    public bool IsConfigured => !string.IsNullOrWhiteSpace(_apiKey);
    public string ModelName => _model;

    public GroqLlmService(string? apiKey = null, string? model = null, string? endpoint = null, HttpClient? httpClient = null)
    {
        _apiKey = apiKey ?? Environment.GetEnvironmentVariable("GROQ_API_KEY");
        _model = !string.IsNullOrWhiteSpace(model) ? model : (Environment.GetEnvironmentVariable("GROQ_MODEL") ?? DefaultModel);
        _endpoint = !string.IsNullOrWhiteSpace(endpoint) ? endpoint : DefaultEndpoint;
        _httpClient = httpClient ?? new HttpClient { Timeout = TimeSpan.FromSeconds(5) };
    }

    public async Task<string?> GenerateChatCompletionAsync(
        string systemPrompt,
        string userPrompt,
        bool jsonMode = false,
        CancellationToken cancellationToken = default)
    {
        if (!IsConfigured)
        {
            return null;
        }

        try
        {
            var requestBody = new Dictionary<string, object>
            {
                ["model"] = _model,
                ["temperature"] = 0.2,
                ["messages"] = new object[]
                {
                    new { role = "system", content = systemPrompt },
                    new { role = "user", content = userPrompt }
                }
            };

            if (jsonMode)
            {
                requestBody["response_format"] = new { type = "json_object" };
            }

            var jsonPayload = JsonSerializer.Serialize(requestBody);
            using var request = new HttpRequestMessage(HttpMethod.Post, _endpoint)
            {
                Content = new StringContent(jsonPayload, Encoding.UTF8, "application/json")
            };

            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _apiKey);

            using var response = await _httpClient.SendAsync(request, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                var errorText = await response.Content.ReadAsStringAsync(cancellationToken);
                Console.WriteLine($"[GroqLlmService] API Error ({response.StatusCode}): {errorText}");
                return null;
            }

            var responseJson = await response.Content.ReadAsStringAsync(cancellationToken);
            using var doc = JsonDocument.Parse(responseJson);

            if (doc.RootElement.TryGetProperty("choices", out var choices) &&
                choices.GetArrayLength() > 0 &&
                choices[0].TryGetProperty("message", out var message) &&
                message.TryGetProperty("content", out var content))
            {
                return content.GetString();
            }

            return null;
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[GroqLlmService] Exception: {ex.Message}");
            return null;
        }
    }
}