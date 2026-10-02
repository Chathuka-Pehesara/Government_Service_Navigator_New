using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using AgenticAi.Agents.IntakePlanningAgent;
using AgenticAi.Services;
using Government_Service_Navigator.AgenticAi.Agents.EligibilityDocumentAgent.DTOs;
using Government_Service_Navigator.AgenticAi.Agents.EligibilityDocumentAgent.Retrieval;
using Government_Service_Navigator.AgenticAi.Tools.CheckEligibilityRules;
using Government_Service_Navigator.AgenticAi.Tools.GetDocumentRequirements;
using Pgvector;

namespace Government_Service_Navigator.AgenticAi.Agents.EligibilityDocumentAgent;

/// <summary>
/// Agent 2 (Eligibility & Document Intelligence Agent) — Evaluates citizen eligibility
/// and analyzes uploaded evidentiary documents against official statutory regulations
/// stored in Neon pgvector. Uses Groq Cloud AI LLM reasoning for semantic matching
/// and natural language explanations, with deterministic tool guardrails as a fail-safe.
/// </summary>
public class EligibilityDocumentAgent : IEligibilityDocumentAgent
{
    private readonly IEligibilityVectorRetriever _retriever;
    private readonly IEmbeddingService _embeddingService;
    private readonly ICheckEligibilityRulesTool _rulesTool;
    private readonly IGetDocumentRequirementsTool _docsTool;
    private readonly ILlmService? _llmService;

    public EligibilityDocumentAgent(
        IEligibilityVectorRetriever retriever, 
        IEmbeddingService embeddingService,
        ICheckEligibilityRulesTool rulesTool,
        IGetDocumentRequirementsTool docsTool,
        ILlmService? llmService = null)
    {
        _retriever = retriever;
        _embeddingService = embeddingService;
        _rulesTool = rulesTool;
        _docsTool = docsTool;
        _llmService = llmService;
    }

    public async Task<EligibilityPlanResponse> EvaluateEligibilityAsync(
        EligibilityPlanRequest request, 
        CancellationToken cancellationToken = default)
    {
        var profile = request.Profile ?? new CitizenProfile();
        var providedDocs = profile.ProvidedDocuments ?? new List<string>();
        int serviceId = request.ServiceId ?? 1;

        // 1. Retrieve the service's regulatory policy context from Neon pgvector
        var topContexts = new List<string>();
        ServiceCatalogChunk? serviceChunk = null;
        try
        {
            var queryText = $"{request.ServiceName}. {request.PlanSummary}";
            Vector queryEmbedding = await _embeddingService.GetEmbeddingAsync(queryText);

            topContexts = await _retriever.GetRelevantEligibilityContextAsync(
                queryEmbedding, 
                categoryFilter: null, 
                limit: 8, 
                cancellationToken: cancellationToken);

            serviceChunk = FindServiceChunk(topContexts, request.ServiceName);
        }
        catch
        {
            topContexts = new List<string> { "Vector DB unavailable; document requirements tool fallback applied." };
        }

        // 2. Baseline deterministic tool guardrails: statutory age / citizenship criteria
        var ruleResult = _rulesTool.EvaluateRules(serviceId, profile.Age, profile.CitizenshipStatus);

        // 3. Document requirements lookup
        var fromVectorDb = serviceChunk != null && !request.Stage.HasValue;
        var requiredDocs = (request.Stage.HasValue || !fromVectorDb)
            ? await _docsTool.GetRequiredDocumentsForServiceAsync(serviceId, request.Stage, cancellationToken)
            : serviceChunk!.RequiredDocuments;

        if (requiredDocs.Count == 0 && serviceChunk != null && serviceChunk.RequiredDocuments.Count > 0)
        {
            requiredDocs = serviceChunk.RequiredDocuments;
        }

        // 4. If Groq AI LLM is configured, perform cognitive semantic eligibility and document reasoning
        if (_llmService != null && _llmService.IsConfigured)
        {
            var aiResponse = await TryEvaluateWithAiAsync(
                request, 
                profile, 
                serviceId, 
                ruleResult, 
                requiredDocs, 
                topContexts, 
                cancellationToken);

            if (aiResponse != null)
            {
                return aiResponse;
            }
        }

        // 5. Fallback: Deterministic evaluation (used in offline mode / test stubs)
        return GenerateDeterministicEvaluation(request, profile, ruleResult, requiredDocs, fromVectorDb, topContexts);
    }

    private async Task<EligibilityPlanResponse?> TryEvaluateWithAiAsync(
        EligibilityPlanRequest request,
        CitizenProfile profile,
        int serviceId,
        EligibilityRuleResult ruleResult,
        List<string> requiredDocs,
        List<string> topContexts,
        CancellationToken cancellationToken)
    {
        try
        {
            const string systemPrompt = 
                "You are Agent 2 (Eligibility & Document Intelligence Agent) of the Sri Lanka Government Service Navigator platform.\n" +
                "Your objective is to evaluate a citizen's eligibility for a government service and intelligently analyze their submitted evidentiary documents against statutory circulars and regulations in the official knowledge base.\n\n" +
                "GUIDELINES:\n" +
                "1. Ground your evaluation on the provided Official Statutory Policy Context and deterministic tool baselines.\n" +
                "2. Evaluate age, citizenship, and any specific legal prerequisites from the regulations.\n" +
                "3. Analyze provided documents with semantic intelligence:\n" +
                "   - Match uploaded filenames/labels to required documents. If an upload has a descriptive name or label (e.g. 'nic_front.jpg', 'National Identity Card: image.jpg', 'birth_certificate.pdf'), match it to the corresponding statutory requirement.\n" +
                "   - If an uploaded file is generic or unlabelled (e.g. 'WhatsApp Image...', 'IMG_001.jpg', 'photo.png'), EXPLICITLY identify it by name in 'reasoning': explain that the AI Agent cannot determine which document requirement this generic file represents, and instruct the citizen to re-upload it with a descriptive filename (e.g. 'nic_front.jpg') or tag it with the document type.\n" +
                "4. STRICT DETERMINATION OF ELIGIBILITY ('isEligible'):\n" +
                "   - 'isEligible' MUST be TRUE ONLY IF: the applicant satisfies all statutory criteria (age, citizenship, etc.) AND has provided all mandatory required documents.\n" +
                "   - If ANY mandatory document is missing or unverified, 'isEligible' MUST be FALSE.\n" +
                "5. Compute 'matchPercentage' (0 to 100):\n" +
                "   - 100% only when all criteria and all mandatory documents are fully satisfied.\n" +
                "   - If mandatory documents are missing or unlabelled, deduct points proportionally (e.g., if 0 of 2 required documents are verified, match percentage must be 40% or lower).\n" +
                "6. In 'reasoning':\n" +
                "   - Transparently explain the decision as a cognitive government service agent. Mention each uploaded file by name, stating whether it was recognized or unlabelled, and give actionable instructions for missing documents.\n" +
                "7. Output ONLY a valid JSON object matching this schema:\n" +
                "{\n" +
                "  \"isEligible\": boolean,\n" +
                "  \"matchPercentage\": number,\n" +
                "  \"missingCriteria\": [\"string\"],\n" +
                "  \"requiredDocuments\": [\"string\"],\n" +
                "  \"missingDocuments\": [\"string\"],\n" +
                "  \"reasoning\": \"string\"\n" +
                "}";

            var contextBlock = topContexts.Count > 0
                ? string.Join("\n---\n", topContexts)
                : "No matching policy context found.";

            var providedDocsList = profile.ProvidedDocuments?.Count > 0
                ? string.Join(", ", profile.ProvidedDocuments)
                : "None provided yet";

            var userPrompt = 
                $"SERVICE: {request.ServiceName} (ID: {serviceId})\n" +
                $"STAGE: {(request.Stage.HasValue ? $"Stage {request.Stage}" : "Initial Application")}\n\n" +
                $"CITIZEN PROFILE:\n" +
                $"- Age: {profile.Age}\n" +
                $"- Citizenship: {profile.CitizenshipStatus}\n" +
                $"- Annual Income: LKR {profile.AnnualIncome:N2}\n" +
                $"- Employment: {profile.EmploymentStatus}\n" +
                $"- Provided Documents / Uploads: {providedDocsList}\n\n" +
                $"BASELINE RULES TOOL RESULTS:\n" +
                $"- Deterministic Eligibility Pass: {ruleResult.IsEligible}\n" +
                $"- Rule Tool Missing Criteria: {(ruleResult.MissingCriteria.Count > 0 ? string.Join(", ", ruleResult.MissingCriteria) : "None")}\n" +
                $"- Catalog Required Documents: {(requiredDocs.Count > 0 ? string.Join(", ", requiredDocs) : "No specific documents")}\n\n" +
                $"OFFICIAL REGULATORY & POLICY CONTEXT (Retrieved from Neon pgvector):\n{contextBlock}\n\n" +
                "Evaluate the citizen's eligibility and uploaded documents, and generate the structured JSON evaluation report.";

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

            var isEligible = root.TryGetProperty("isEligible", out var eligElem) && eligElem.GetBoolean();
            var matchPercentage = root.TryGetProperty("matchPercentage", out var matchElem) ? matchElem.GetInt32() : 0;
            matchPercentage = Math.Clamp(matchPercentage, 0, 100);

            var missingCriteria = new List<string>();
            if (root.TryGetProperty("missingCriteria", out var critElem) && critElem.ValueKind == JsonValueKind.Array)
            {
                foreach (var item in critElem.EnumerateArray())
                {
                    var c = item.GetString();
                    if (!string.IsNullOrWhiteSpace(c)) missingCriteria.Add(c);
                }
            }

            var aiRequiredDocs = new List<string>();
            if (root.TryGetProperty("requiredDocuments", out var reqElem) && reqElem.ValueKind == JsonValueKind.Array)
            {
                foreach (var item in reqElem.EnumerateArray())
                {
                    var d = item.GetString();
                    if (!string.IsNullOrWhiteSpace(d)) aiRequiredDocs.Add(d);
                }
            }

            // Fallback to catalog requirements if AI returned an empty list
            if (aiRequiredDocs.Count == 0 && requiredDocs.Count > 0)
            {
                aiRequiredDocs = requiredDocs;
            }

            var missingDocs = new List<string>();
            if (root.TryGetProperty("missingDocuments", out var missElem) && missElem.ValueKind == JsonValueKind.Array)
            {
                foreach (var item in missElem.EnumerateArray())
                {
                    var md = item.GetString();
                    if (!string.IsNullOrWhiteSpace(md)) missingDocs.Add(md);
                }
            }

            // DETERMINISTIC GUARDRAIL:
            // If any document flagged as missing by LLM is actually provided in profile.ProvidedDocuments, remove it from missingDocs
            var providedDocs = profile.ProvidedDocuments ?? new List<string>();
            missingDocs.RemoveAll(md => providedDocs.Any(prov => DocumentMatches(md, prov)));

            // DETERMINISTIC GUARDRAILS:
            // 1. If any mandatory documents or criteria are missing, or rule tool failed, citizen cannot be eligible
            if (missingDocs.Count > 0 || missingCriteria.Count > 0 || !ruleResult.IsEligible)
            {
                isEligible = false;
            }

            // 2. If missing documents, match percentage cannot be 100%
            if (missingDocs.Count > 0 && matchPercentage == 100)
            {
                matchPercentage = 50;
            }

            var reasoning = root.TryGetProperty("reasoning", out var reasonElem) ? reasonElem.GetString() : null;
            if (string.IsNullOrWhiteSpace(reasoning))
            {
                reasoning = isEligible 
                    ? $"Applicant meets eligibility requirements for {request.ServiceName}."
                    : $"Applicant does not yet satisfy all requirements for {request.ServiceName}.";
            }

            return new EligibilityPlanResponse(
                IsEligible: isEligible,
                MatchPercentage: matchPercentage,
                MissingCriteria: missingCriteria,
                RequiredDocuments: aiRequiredDocs,
                MissingDocuments: missingDocs,
                Reasoning: reasoning,
                RetrievedContextSnippets: topContexts);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[EligibilityDocumentAgent] AI evaluation error: {ex.Message}. Falling back to deterministic rules.");
            return null;
        }
    }

    private static EligibilityPlanResponse GenerateDeterministicEvaluation(
        EligibilityPlanRequest request,
        CitizenProfile profile,
        EligibilityRuleResult ruleResult,
        List<string> requiredDocs,
        bool fromVectorDb,
        List<string> topContexts)
    {
        var providedDocs = profile.ProvidedDocuments ?? new List<string>();
        var missingDocs = requiredDocs.Where(req => !providedDocs.Any(prov => DocumentMatches(req, prov))).ToList();

        var isEligible = ruleResult.IsEligible;
        var reasoning = BuildReasoning(request.ServiceName, profile, ruleResult, requiredDocs, missingDocs, fromVectorDb, isEligible);

        return new EligibilityPlanResponse(
            IsEligible: isEligible,
            MatchPercentage: Math.Clamp(ruleResult.ScorePercentage - (missingDocs.Count * 15), 0, 100),
            MissingCriteria: ruleResult.MissingCriteria,
            RequiredDocuments: requiredDocs,
            MissingDocuments: missingDocs,
            Reasoning: reasoning,
            RetrievedContextSnippets: topContexts);
    }

    private static readonly HashSet<string> GenericDocumentWords = new(StringComparer.Ordinal)
    {
        "required", "upload", "uploaded", "attachment", "file", "copy", "scan", "pdf", "jpg", "jpeg", "png", "doc", "docx",
        "certificate", "card", "proof", "form", "completed", "official", "original", "letter"
    };

    private static bool DocumentMatches(string required, string provided)
    {
        if (string.IsNullOrWhiteSpace(provided)) return false;

        var allRequiredTokens = TextTokenizer.Tokenize(required);
        var requiredTokens = allRequiredTokens.Where(t => !GenericDocumentWords.Contains(t)).ToList();
        var providedTokens = TextTokenizer.Tokenize(provided).Where(t => !GenericDocumentWords.Contains(t)).ToList();

        var initials = string.Concat(allRequiredTokens.Select(t => t[0]));
        if (initials.Length >= 2 && providedTokens.Contains(initials)) return true;

        return TextTokenizer.SharesKeyword(requiredTokens, providedTokens);
    }

    private static ServiceCatalogChunk? FindServiceChunk(List<string> contexts, string serviceName)
    {
        var chunks = contexts.Select(ServiceCatalogChunk.TryParse).Where(c => c != null).Select(c => c!).ToList();

        return chunks.FirstOrDefault(c => c.ServiceName.Equals(serviceName?.Trim(), StringComparison.OrdinalIgnoreCase))
            ?? chunks.FirstOrDefault(c => TextTokenizer.SharesKeyword(TextTokenizer.Tokenize(serviceName), c.KeywordTokens()));
    }

    private static string BuildReasoning(
        string serviceName,
        CitizenProfile profile,
        EligibilityRuleResult ruleResult,
        List<string> requiredDocs,
        List<string> missingDocs,
        bool fromVectorDb,
        bool isEligible)
    {
        var criteria = ruleResult.MissingCriteria.Count == 0
            ? $"The applicant meets the age ({profile.Age}) and citizenship ({profile.CitizenshipStatus}) criteria"
            : $"Criteria not met: {string.Join(" ", ruleResult.MissingCriteria)}";

        var source = fromVectorDb ? "the service catalog (vector DB)" : "the service catalog";
        var documents = requiredDocs.Count == 0
            ? $"{source} lists no required documents"
            : missingDocs.Count == 0
                ? $"all {requiredDocs.Count} documents required by {source} match an uploaded file"
                : $"not matched to an upload, officer to confirm (per {source}): {string.Join(", ", missingDocs)}";

        return $"{(isEligible ? "Eligible" : "Not yet eligible")} for {serviceName}. {criteria}; {documents}.";
    }
}
