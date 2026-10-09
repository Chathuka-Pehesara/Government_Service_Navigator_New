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
        var fromVectorDb = serviceChunk != null && serviceChunk.RequiredDocuments.Count > 0 && !request.Stage.HasValue;
        var requiredDocs = fromVectorDb
            ? serviceChunk!.RequiredDocuments
            : await _docsTool.GetRequiredDocumentsForServiceAsync(serviceId, request.Stage, cancellationToken);

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
                "   - Different services require diverse statutory proofs (e.g. Title Deeds, Surveyor Plans, Business Registration Form 1, Tax Clearance, Medical Certificates, Salary/Income Slips, Police Clearance Reports, Grama Niladhari Certificates, Identity Documents, Passports, etc.). Never assume all services require only an NIC or Birth Certificate. Audit strictly against the required documents specified for this service and stage.\n" +
                "   - SEMANTIC RELEVANCE & AUTHENTICITY AUDIT (Applies to ANY service and ANY stage):\n" +
                "     * If an uploaded file name contains keywords identifying the required document (e.g., 'NIC', 'identity' for National Identity Card; 'birth', 'certificate', 'bc' for Birth Certificate; 'deed' for Title Deed, etc.), report it as verified and semantically matched.\n" +
                "     * If an upload has a generic camera/device name (e.g., 'WhatsApp Image...', 'IMG_...', 'photo...', 'image...') that lacks document title keywords: the file is present in the slot, so do NOT mark it missing. Set 'isEligible' to true, set 'matchPercentage' to 80%, and explicitly state in 'reasoning' that because the file is a generic capture ('filename'), the Verifying Officer must visually inspect the upload to confirm authenticity before final determination.\n" +
                "     * If a mandatory document is completely missing or an unrelated/adversarial file is uploaded, set 'isEligible' to false, 'matchPercentage' to 40%, and list it in 'missingDocuments'.\n" +
                "4. DETERMINATION OF ELIGIBILITY ('isEligible'):\n" +
                "   - 'isEligible' is TRUE when applicant meets age/citizenship criteria and all required stage documents are uploaded.\n" +
                "   - 'isEligible' is FALSE ONLY IF a mandatory required document is missing or criteria are failed.\n" +
                "5. Compute 'matchPercentage' (0 to 100):\n" +
                "   - 100% when all criteria and all mandatory documents are uploaded with named matching files.\n" +
                "   - 80% if all required documents are attached but one or more have generic camera/device filenames requiring officer visual verification.\n" +
                "   - 50% or below if mandatory documents are completely missing.\n" +
                "6. In 'reasoning':\n" +
                "   - Clearly evaluate each required document. Specifically note which files are verified by name, and which generic uploads require officer visual verification before approval.\n" +
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
                $"- Catalog Required Documents: {(requiredDocs.Count > 0 ? string.Join(", ", requiredDocs) : "None (No evidentiary documents required for this stage)")}\n\n" +
                $"OFFICIAL REGULATORY & POLICY CONTEXT (Retrieved from Neon pgvector):\n{contextBlock}\n\n" +
                "Evaluate the citizen's eligibility and uploaded documents, and generate the structured JSON evaluation report. NOTE: If no evidentiary documents are required for this stage, do NOT flag missing documents or mark applicant ineligible due to documents.";

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

            // Any required document that has not been provided MUST be flagged as missing
            foreach (var req in requiredDocs)
            {
                if (!providedDocs.Any(prov => DocumentMatches(req, prov)) && !missingDocs.Any(md => DocumentMatches(req, md)))
                {
                    missingDocs.Add(req);
                }
            }

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

            // 3. If this stage has no required documents, ensure clean state without cross-stage artifacts
            if (requiredDocs.Count == 0 && request.Stage.HasValue)
            {
                missingDocs.Clear();
                aiRequiredDocs.Clear();
                if (ruleResult.IsEligible)
                {
                    isEligible = true;
                    matchPercentage = 100;
                    missingCriteria.Clear();
                }
            }

            var reasoning = root.TryGetProperty("reasoning", out var reasonElem) ? reasonElem.GetString() : null;
            if (requiredDocs.Count == 0 && request.Stage.HasValue && ruleResult.IsEligible)
            {
                if (string.IsNullOrWhiteSpace(reasoning) || reasoning.Contains("missing", StringComparison.OrdinalIgnoreCase) || reasoning.Contains("unverified", StringComparison.OrdinalIgnoreCase) || reasoning.Contains("suspicious", StringComparison.OrdinalIgnoreCase))
                {
                    reasoning = $"The applicant satisfies all statutory criteria. Stage {request.Stage} does not require any additional evidentiary documents.";
                }
            }
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
