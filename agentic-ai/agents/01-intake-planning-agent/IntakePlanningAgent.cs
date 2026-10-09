using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using AgenticAi.Services;
using Government_Service_Navigator.AgenticAi.Tools.RecommendServices;
using Government_Service_Navigator.AgenticAi.Tools.SearchServiceCatalog;
using Pgvector;

namespace AgenticAi.Agents.IntakePlanningAgent;

/// <summary>
/// Agent 1 (Intake & Planning Agent) — Analyzes the citizen's free-text situation,
/// retrieves relevant official catalog context from the pgvector database (RAG),
/// and uses Groq AI LLM reasoning to synthesize a tailored, step-by-step roadmap.
/// If a specific policy cannot be found, it explains the absence and recommends
/// supported services with active embedded policies.
/// Uses 2 specialized tools:
/// 1. ISearchServiceCatalogTool (search_service_catalog)
/// 2. IRecommendServicesTool (recommend_services)
/// </summary>
public class IntakePlanningAgent : IIntakePlanningAgent
{
    private const string NotFound = "Service Not Found";

    private readonly IVectorRetriever _retriever;
    private readonly IEmbeddingService _embeddingService;
    private readonly ISearchServiceCatalogTool _catalogTool;
    private readonly IRecommendServicesTool _recommendTool;
    private readonly ILlmService? _llmService;

    public IntakePlanningAgent(
        IVectorRetriever retriever, 
        IEmbeddingService embeddingService,
        ISearchServiceCatalogTool? catalogTool = null,
        IRecommendServicesTool? recommendTool = null,
        ILlmService? llmService = null)
    {
        _retriever = retriever;
        _embeddingService = embeddingService;
        _catalogTool = catalogTool ?? new SearchServiceCatalogTool();
        _recommendTool = recommendTool ?? new RecommendServicesTool(_catalogTool);
        _llmService = llmService;
    }

    public IntakePlanningAgent(
        IVectorRetriever retriever,
        IEmbeddingService embeddingService,
        ILlmService? llmService)
        : this(retriever, embeddingService, null, null, llmService)
    {
    }

    public async Task<IntakePlanResponse> GeneratePlanAsync(
        IntakePlanRequest request, 
        CancellationToken cancellationToken = default)
    {
        // 1. Tool 1: Search Service Catalog for active candidate matches
        var catalogMatches = await _catalogTool.SearchAsync(request.UserNeedDescription, cancellationToken);

        // 2. Vectorize user query
        Vector queryEmbedding = await _embeddingService.GetEmbeddingAsync(request.UserNeedDescription);

        // 3. Retrieve top matching knowledge chunks from the vector database (RAG)
        var topResults = await _retriever.GetRelevantContextAsync(queryEmbedding, 8, cancellationToken);

        // MANDATORY INVARIANT: Agent 1's responsibility is ONLY to provide guidelines by looking
        // at the vector database containing policies for services. If the vector database has NO policies,
        // or if none of the retrieved chunks match the citizen inquiry, Agent 1 CANNOT provide guidelines.
        if (topResults == null || topResults.Count == 0)
        {
            return CreateNoPolicyResponse(new List<string>());
        }

        // Verify that at least one retrieved chunk actually shares keywords with the citizen inquiry
        var queryTokens = TextTokenizer.Tokenize(request.UserNeedDescription);
        var genericTokens = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "certificate", "certificat", "copy", "copi", "issuance", "issuanc",
            "registration", "registr", "renewal", "renew", "license", "licens",
            "report", "permit", "application", "service", "document", "extract"
        };
        var distinctiveQueryTokens = queryTokens.Where(t => !genericTokens.Contains(t)).ToList();
        var matchTokens = distinctiveQueryTokens.Count > 0 ? distinctiveQueryTokens : queryTokens;

        bool hasRelevantChunk = matchTokens.Count > 0 && topResults.Any(chunk =>
        {
            var parsed = ServiceCatalogChunk.TryParse(chunk);
            if (parsed != null && !string.IsNullOrWhiteSpace(parsed.ServiceName))
            {
                var svcTokens = TextTokenizer.Tokenize(parsed.ServiceName);
                // A policy chunk is only relevant if the citizen's inquiry shares keywords with the service itself
                if (TextTokenizer.SharesKeyword(matchTokens, svcTokens))
                {
                    return true;
                }

                // If chunk has a specific category or procedure title, check that too
                if (!string.IsNullOrWhiteSpace(parsed.Category))
                {
                    var catTokens = TextTokenizer.Tokenize(parsed.Category);
                    if (TextTokenizer.SharesKeyword(matchTokens, catTokens))
                    {
                        return true;
                    }
                }

                // The chunk belongs to an unrelated service (only matched on generic text or supporting document mentions)
                return false;
            }

            var chunkTokens = parsed != null ? parsed.KeywordTokens() : TextTokenizer.Tokenize(chunk);
            return TextTokenizer.SharesKeyword(matchTokens, chunkTokens);
        });

        if (!hasRelevantChunk)
        {
            return CreateNoPolicyResponse(topResults);
        }

        IntakePlanResponse? plan = null;

        // 4. If LLM service is available, let the AI Agent reason over the citizen need and official context
        if (_llmService != null && _llmService.IsConfigured)
        {
            plan = await TryGenerateAiPlanAsync(request.UserNeedDescription, topResults, cancellationToken);
        }

        // 5. Fallback: Deterministic catalog matching (used in offline mode / test stubs)
        plan ??= GenerateDeterministicPlan(request.UserNeedDescription, topResults);

        // 6. Strict Validation Guardrail: Ensure recommended service actually exists in the retrieved vector DB chunks
        if (plan != null && !string.IsNullOrWhiteSpace(plan.RecommendedService) && !plan.RecommendedService.Contains("Not Found", StringComparison.OrdinalIgnoreCase))
        {
            var planServiceName = plan.RecommendedService.Trim();
            if (planServiceName.Contains(" - "))
            {
                planServiceName = planServiceName.Split(new[] { " - " }, StringSplitOptions.None)[0].Trim();
            }

            bool isSubstantiatedByVectorDb = topResults.Any(chunk =>
            {
                var parsed = ServiceCatalogChunk.TryParse(chunk);
                if (parsed != null && !string.IsNullOrWhiteSpace(parsed.ServiceName))
                {
                    return string.Equals(parsed.ServiceName, planServiceName, StringComparison.OrdinalIgnoreCase)
                        || parsed.ServiceName.Contains(planServiceName, StringComparison.OrdinalIgnoreCase)
                        || planServiceName.Contains(parsed.ServiceName, StringComparison.OrdinalIgnoreCase);
                }

                return chunk.Contains(planServiceName, StringComparison.OrdinalIgnoreCase);
            });

            if (!isSubstantiatedByVectorDb)
            {
                // The LLM hallucinated a service name that is not present in the vector DB policy chunks
                plan = CreateNoPolicyResponse(topResults);
            }
        }

        // 7. Tool 2: If service not recognized or no policy found, invoke RecommendServicesTool to suggest officially configured services
        if (plan != null && (string.IsNullOrWhiteSpace(plan.RecommendedService) || plan.RecommendedService.Contains("Not Found", StringComparison.OrdinalIgnoreCase)))
        {
            var alternatives = await _recommendTool.RecommendAlternativesAsync(request.UserNeedDescription, cancellationToken);
            if (alternatives != null && alternatives.Count > 0)
            {
                var stepList = new List<string>(plan.StepByStepPlan);
                stepList.Add($"Officially supported active services in registry: {string.Join(", ", alternatives)}.");
                plan = plan with { StepByStepPlan = stepList };
            }
        }

        return plan!;
    }

    private static IntakePlanResponse CreateNoPolicyResponse(List<string> topResults)
    {
        return new IntakePlanResponse(
            RecommendedService: NotFound,
            RequiredDocuments: new List<string>(),
            StepByStepPlan: new List<string>
            {
                "No official statutory policy or procedural rules were found in the vector knowledge base for this service inquiry.",
                "Agent 1 is strictly restricted to providing guidelines verified against official policy documents registered in the vector database.",
                "Currently, no active policies for this service are registered in the knowledge base. Please check the official service portal or contact the relevant government department helpdesk."
            },
            RetrievedContextSnippets: topResults ?? new List<string>());
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
                "   - Set 'recommendedService' to the EXACT official service name specified in the chunk headers (e.g. '[ServiceName - ...]' -> use the exact ServiceName without alteration or paraphrase).\n" +
                "   - Extract all mandatory documents specified in the policy into 'requiredDocuments' (e.g. Original Birth Certificate, ICAO Photo Studio Receipt, Grama Niladhari Certificate).\n" +
                "   - Formulate a comprehensive 'stepByStepPlan' detailing the official statutory procedure, exact fees, office locations, and biometric protocols directly from the embedded policy.\n" +
                "   - In the step-by-step plan, explicitly dedicate a step (e.g. Step 2) naming the exact mandatory documents that the citizen must prepare.\n" +
                "   - STRICT GROUNDING: State ONLY the fee amounts, payment methods, and exemptions explicitly mentioned in the provided policy context. Do NOT invent, assume, or fabricate additional fee tiers, tariffs, penalty amounts, or regulations not written in the context.\n" +
                "4. STRICT POLICY GROUNDING RULE: ONLY IF the provided catalog context contains an active policy for the citizen's request may you recommend it. If the provided context contains NO relevant policy, circular, or rules for the citizen's request (or only unrelated services):\n" +
                "   - You MUST set 'recommendedService' to 'Service Not Found'.\n" +
                "   - You MUST set 'requiredDocuments' to an empty array [].\n" +
                "   - In 'stepByStepPlan':\n" +
                "     * Step 1: Explicitly state that no official statutory policy or procedural rules for the requested service exist in the vector knowledge base.\n" +
                "     * Step 2: Note that Agent 1 can only provide guidelines when an official policy is registered in the database.\n" +
                "     * Step 3: Suggest the citizen check the active Service Catalog in the portal or contact the relevant Divisional Secretariat / physical department.\n" +
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
        var genericTokens = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "certificate", "certificat", "copy", "copi", "issuance", "issuanc",
            "registration", "registr", "renewal", "renew", "license", "licens",
            "report", "permit", "application", "service", "document", "extract"
        };
        var distinctiveQueryTokens = queryTokens.Where(t => !genericTokens.Contains(t)).ToList();
        var matchTokens = distinctiveQueryTokens.Count > 0 ? distinctiveQueryTokens : queryTokens;

        var match = topResults
            .Select(ServiceCatalogChunk.TryParse)
            .Where(chunk => chunk != null && TextTokenizer.SharesKeyword(matchTokens, chunk.KeywordTokens()))
            .OrderByDescending(chunk => chunk!.KeywordTokens().Count(kt => matchTokens.Contains(kt)))
            .FirstOrDefault();

        if (match == null)
        {
            return CreateNoPolicyResponse(topResults);
        }

        var steps = new List<string>();
        steps.Add(match.RequiredDocuments.Count > 0
            ? $"Step {steps.Count + 1}: Gather the required documents: {string.Join(", ", match.RequiredDocuments)}."
            : $"Step {steps.Count + 1}: No specific documents are required for this service.");
        steps.Add($"Step {steps.Count + 1}: Submit an application for {match.ServiceName} through the portal.");
        if (!string.IsNullOrWhiteSpace(match.FeeText))
        {
            steps.Add($"Step {steps.Count + 1}: Pay the applicable fees: {match.FeeText}.");
        }
        steps.Add($"Step {steps.Count + 1}: Track your application status until a Verifying Officer completes the review.");

        return new IntakePlanResponse(
            RecommendedService: match.ServiceName,
            RequiredDocuments: match.RequiredDocuments,
            StepByStepPlan: steps,
            RetrievedContextSnippets: topResults);
    }
}