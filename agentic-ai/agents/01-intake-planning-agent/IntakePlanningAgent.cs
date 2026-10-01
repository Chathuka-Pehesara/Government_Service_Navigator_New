using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using AgenticAi.Services;
using Pgvector;

namespace AgenticAi.Agents.IntakePlanningAgent;

/// <summary>
/// Agent 1 (Intake & Planning Agent) — Analyzes the citizen's free-text situation,
/// retrieves relevant official catalog context from the pgvector database (RAG),
/// and uses Groq AI LLM reasoning to synthesize a tailored, step-by-step roadmap.
/// If a specific policy cannot be found, it explains the absence and recommends
/// supported services with active embedded policies.
/// </summary>
public class IntakePlanningAgent : IIntakePlanningAgent
{
    private const string NotFound = "Service Not Found";

    private readonly IVectorRetriever _retriever;
    private readonly IEmbeddingService _embeddingService;
    private readonly ILlmService? _llmService;

    public IntakePlanningAgent(
        IVectorRetriever retriever, 
        IEmbeddingService embeddingService,
        ILlmService? llmService = null)
    {
        _retriever = retriever;
        _embeddingService = embeddingService;
        _llmService = llmService;
    }

    public async Task<IntakePlanResponse> GeneratePlanAsync(
        IntakePlanRequest request, 
        CancellationToken cancellationToken = default)
    {
        // 1. Vectorize user query
        Vector queryEmbedding = await _embeddingService.GetEmbeddingAsync(request.UserNeedDescription);

        // 2. Retrieve top matching knowledge chunks from the vector database (RAG)
        var topResults = await _retriever.GetRelevantContextAsync(queryEmbedding, 8, cancellationToken);

        // 3. If LLM service is available, let the AI Agent reason over the citizen need and official context
        if (_llmService != null && _llmService.IsConfigured)
        {
            var aiPlan = await TryGenerateAiPlanAsync(request.UserNeedDescription, topResults, cancellationToken);
            if (aiPlan != null)
            {
                return aiPlan;
            }
        }

        // 4. Fallback: Deterministic catalog matching (used in offline mode / test stubs)
        return GenerateDeterministicPlan(request.UserNeedDescription, topResults);
    }

    private async Task<IntakePlanResponse?> TryGenerateAiPlanAsync(
        string userNeed,
        List<string> retrievedSnippets,
        CancellationToken cancellationToken)
    {
        try
        {
            const string systemPrompt = 
                "You are Agent 1 (Citizen Intake & Planning Agent) of the Sri Lanka Government Service Navigator platform.\n" +
                "Your objective is to analyze a citizen's natural language inquiry, match their need to the appropriate official government service using the provided catalog context, and formulate a clear, actionable roadmap.\n\n" +
                "CRITICAL INSTRUCTIONS:\n" +
                "1. Ground your recommendations strictly on the provided Official Catalog Context and knowledge base retrieval.\n" +
                "2. Understand natural variations, citizen situations, and policy circulars attached to services in the catalog context.\n" +
                "3. IF RELEVANT POLICY CHUNKS OR CIRCULARS EXIST in the provided catalog context for the citizen's inquiry:\n" +
                "   - Set 'recommendedService' to the official service name that contains or governs this policy (from the chunk header or the matched catalog service).\n" +
                "   - Extract all mandatory documents specified in the policy into 'requiredDocuments' (e.g. Original Birth Certificate, Police Report, Grama Niladhari certificate, Photo slip).\n" +
                "   - Formulate a comprehensive 'stepByStepPlan' detailing the official statutory procedure, exact fees, office locations, and biometric protocols directly from the embedded policy.\n" +
                "4. ONLY IF the provided catalog context contains NO relevant policy, circular, or rules for the citizen's request (e.g., land deeds, customs tax, unsupported inquiries):\n" +
                "   - Set 'recommendedService' to 'Service Not Found'.\n" +
                "   - Set 'requiredDocuments' to an empty array [].\n" +
                "   - In 'stepByStepPlan':\n" +
                "     * Step 1: Explicitly state that you cannot find the specific statutory policy or rules for the requested service in the platform knowledge base.\n" +
                "     * Step 2: Suggest the citizen check the active Service Catalog in the portal or contact the relevant Divisional Secretariat / physical department.\n" +
                "5. Output ONLY a valid JSON object matching this schema:\n" +
                "{\n" +
                "  \"recommendedService\": \"string\",\n" +
                "  \"requiredDocuments\": [\"string\"],\n" +
                "  \"stepByStepPlan\": [\"string\"]\n" +
                "}";

            var contextBlock = retrievedSnippets.Count > 0
                ? string.Join("\n---\n", retrievedSnippets)
                : "No matching context found in catalog.";

            var userPrompt = 
                $"CITIZEN INQUIRY:\n\"{userNeed}\"\n\n" +
                $"OFFICIAL CATALOG CONTEXT:\n{contextBlock}\n\n" +
                "Analyze the inquiry, match it to the catalog, and generate the structured JSON plan according to the instructions.";

            var jsonResult = await _llmService!.GenerateChatCompletionAsync(
                systemPrompt,
                userPrompt,
                jsonMode: true,
                cancellationToken: cancellationToken);

            if (string.IsNullOrWhiteSpace(jsonResult))
            {
                return null;
            }

            using var doc = JsonDocument.Parse(jsonResult);
            var root = doc.RootElement;

            var serviceName = root.TryGetProperty("recommendedService", out var svcElem) ? svcElem.GetString() : null;
            if (string.IsNullOrWhiteSpace(serviceName))
            {
                return null;
            }

            var requiredDocs = new List<string>();
            if (root.TryGetProperty("requiredDocuments", out var docsElem) && docsElem.ValueKind == JsonValueKind.Array)
            {
                foreach (var item in docsElem.EnumerateArray())
                {
                    var docName = item.GetString();
                    if (!string.IsNullOrWhiteSpace(docName))
                    {
                        requiredDocs.Add(docName);
                    }
                }
            }

            var steps = new List<string>();
            if (root.TryGetProperty("stepByStepPlan", out var stepsElem) && stepsElem.ValueKind == JsonValueKind.Array)
            {
                foreach (var item in stepsElem.EnumerateArray())
                {
                    var stepText = item.GetString();
                    if (!string.IsNullOrWhiteSpace(stepText))
                    {
                        steps.Add(stepText);
                    }
                }
            }

            if (steps.Count == 0)
            {
                steps.Add("Contact the nearest departmental helpdesk for further guidance.");
            }

            return new IntakePlanResponse(
                RecommendedService: serviceName,
                RequiredDocuments: requiredDocs,
                StepByStepPlan: steps,
                RetrievedContextSnippets: retrievedSnippets);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[IntakePlanningAgent] AI Plan Generation failed: {ex.Message}. Falling back to deterministic matching.");
            return null;
        }
    }

    private static IntakePlanResponse GenerateDeterministicPlan(string userNeed, List<string> topResults)
    {
        var queryTokens = TextTokenizer.Tokenize(userNeed);
        var match = topResults
            .Select(ServiceCatalogChunk.TryParse)
            .FirstOrDefault(chunk => chunk != null && TextTokenizer.SharesKeyword(queryTokens, chunk.KeywordTokens()));

        if (match == null)
        {
            return new IntakePlanResponse(
                RecommendedService: NotFound,
                RequiredDocuments: new List<string>(),
                StepByStepPlan: new List<string>
                {
                    "We currently could not find the specific policy or rules for your requested service in our knowledge base.",
                    "Currently, our portal has active embedded policies for: 1) All-Countries Passport Application & Renewal, 2) Driving License Renewal & Extension, 3) Police Clearance Certificate, 4) New Business & Sole Proprietorship Registration, and 5) Death Certificate Extract.",
                    "Please select one of the supported services above, or contact the relevant government department helpdesk for services not yet integrated into the portal."
                },
                RetrievedContextSnippets: topResults);
        }

        var steps = new List<string>();
        steps.Add(match.RequiredDocuments.Count > 0
            ? $"Step {steps.Count + 1}: Gather the required documents: {string.Join(", ", match.RequiredDocuments)}."
            : $"Step {steps.Count + 1}: No specific documents are required for this service.");
        steps.Add($"Step {steps.Count + 1}: Submit an application for {match.ServiceName} through the portal.");
        steps.Add($"Step {steps.Count + 1}: Pay the applicable fees: {match.FeeText}.");
        steps.Add($"Step {steps.Count + 1}: Track your application status until a Verifying Officer completes the review.");

        return new IntakePlanResponse(
            RecommendedService: match.ServiceName,
            RequiredDocuments: match.RequiredDocuments,
            StepByStepPlan: steps,
            RetrievedContextSnippets: topResults);
    }
}