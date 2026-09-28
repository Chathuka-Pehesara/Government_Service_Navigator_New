using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using AgenticAi.Agents.IntakePlanningAgent;
using AgenticAi.Services;
using Government_Service_Navigator.AgenticAi.Agents.ActionToolAgent.DTOs;
using Government_Service_Navigator.AgenticAi.Agents.ActionToolAgent.Retrieval;
using Government_Service_Navigator.AgenticAi.Schemas;
using Government_Service_Navigator.AgenticAi.Tools.CalculateFee;
using Government_Service_Navigator.AgenticAi.Tools.FindAppointmentSlot;
using Government_Service_Navigator.AgenticAi.Tools.PrefillApplication;
using Pgvector;

namespace Government_Service_Navigator.AgenticAi.Agents.ActionToolAgent;

/// <summary>
/// Agent 3 (Action & Application Tool Agent) — executes deterministic tools
/// (prefill application, calculate fee, find appointment slot) and synthesizes
/// official regulatory context using Groq Cloud AI LLM to produce verified draft
/// applications, administrative reasoning, and notes for the verifying officer.
/// </summary>
public class ActionToolAgent : IActionToolAgent
{
    private readonly IActionVectorRetriever _retriever;
    private readonly IEmbeddingService _embeddingService;
    private readonly ICalculateFeeTool _feeTool;
    private readonly IFindAppointmentSlotTool _slotTool;
    private readonly IPrefillApplicationTool _prefillTool;
    private readonly ILlmService? _llmService;

    public ActionToolAgent(
        IActionVectorRetriever retriever,
        IEmbeddingService embeddingService,
        ICalculateFeeTool feeTool,
        IFindAppointmentSlotTool slotTool,
        IPrefillApplicationTool prefillTool,
        ILlmService? llmService = null)
    {
        _retriever = retriever;
        _embeddingService = embeddingService;
        _feeTool = feeTool;
        _slotTool = slotTool;
        _prefillTool = prefillTool;
        _llmService = llmService;
    }

    public async Task<ActionDraftResponse> PrepareDraftAsync(
        ActionDraftRequest request,
        CancellationToken cancellationToken = default)
    {
        var toolCalls = new List<ToolCallRecord>();
        var notes = new List<string>();
        var eligibility = request.Eligibility;

        // 0. Safe failure: never draft an application for an ineligible citizen
        if (eligibility == null || !eligibility.IsEligible)
        {
            var reasons = new List<string>();
            if (eligibility != null)
            {
                reasons.AddRange(eligibility.MissingCriteria);
                reasons.AddRange(eligibility.MissingDocuments.Select(d => $"Missing document: {d}"));
            }
            if (reasons.Count == 0) reasons.Add("Eligibility has not been confirmed by Agent 2.");

            return new ActionDraftResponse(
                IsReadyForValidation: false,
                Draft: null,
                Fee: null,
                Appointment: null,
                UnfilledRequiredFields: new List<string>(),
                Blockers: reasons,
                NotesForOfficer: new List<string>(),
                Reasoning: $"Not eligible for {request.ServiceName} — {string.Join("; ", reasons)}. No draft application was prepared.",
                ToolCalls: toolCalls,
                RetrievedContextSnippets: new List<string>());
        }

        // 1. Tool: prefill_application
        var prefill = await _prefillTool.PrefillAsync(request.ServiceProcedureId, request.Applicant, request.Stage, cancellationToken);
        toolCalls.Add(Record("prefill_application",
            new { request.ServiceProcedureId, request.Stage, Applicant = MaskNic(request.Applicant.CitizenNic) },
            new { FilledFields = prefill.FormFields.Keys, prefill.UnfilledRequiredFields, prefill.UsedDefaultTemplate }));

        // 2. Tool: calculate_fee
        var fee = await _feeTool.CalculateAsync(request.ServiceProcedureId, request.ExpressProcessing, stage: request.Stage, cancellationToken: cancellationToken);
        toolCalls.Add(Record("calculate_fee",
            new { request.ServiceProcedureId, request.ExpressProcessing, request.Stage },
            fee));

        // 3. Tool: find_appointment_slot
        var slot = await _slotTool.FindSlotAsync(request.ServiceProcedureId, request.PreferredAppointmentDateUtc);
        toolCalls.Add(Record("find_appointment_slot",
            new { request.ServiceProcedureId, request.PreferredAppointmentDateUtc },
            slot));

        var formFields = new Dictionary<string, string>(prefill.FormFields);
        var unfilledRequired = new List<string>(prefill.UnfilledRequiredFields);
        List<string> retrievedSnippets;

        // 4. RAG: retrieve the official fee / form / appointment knowledge from the vector DB
        try
        {
            var queryText = $"Service: {request.ServiceName}. Application form fields, fee schedule and appointment policy. " +
                            $"Unfilled fields: {string.Join(", ", prefill.UnfilledRequiredFields.Concat(prefill.UnfilledOptionalFields))}.";

            Vector queryEmbedding = await _embeddingService.GetEmbeddingAsync(queryText);
            retrievedSnippets = await _retriever.GetRelevantActionContextAsync(queryEmbedding, limit: 5, cancellationToken);
        }
        catch
        {
            // The draft comes from deterministic tools; the retrieved context is informational only
            retrievedSnippets = new List<string> { "Vector DB unavailable; deterministic tool results only." };
        }

        var reasoning = DeterministicReasoning(request, fee, slot, unfilledRequired);

        notes.AddRange(fee.Notes);
        if (!slot.IsSlotFound) notes.Add(slot.Message);
        if (eligibility.MissingDocuments.Count > 0)
            notes.Add($"Documents still outstanding per Agent 2: {string.Join(", ", eligibility.MissingDocuments)}.");

        // Cognitive synthesis via Groq Cloud AI LLM
        if (_llmService != null && _llmService.IsConfigured)
        {
            var (aiReasoning, aiNotes) = await TrySynthesizeWithAiAsync(request, fee, slot, prefill, retrievedSnippets, cancellationToken);
            if (!string.IsNullOrWhiteSpace(aiReasoning))
            {
                reasoning = aiReasoning;
            }
            if (aiNotes != null && aiNotes.Count > 0)
            {
                notes.AddRange(aiNotes);
            }
        }

        // 5. Assemble the draft application (schema shared with Agent 4)
        var draft = new DraftApplication
        {
            ApplicationId = request.ApplicationId,
            ServiceProcedureId = request.ServiceProcedureId,
            ServiceName = request.ServiceName,
            CitizenNic = request.Applicant.CitizenNic,
            CitizenName = request.Applicant.FullName,
            CitizenAge = request.Applicant.Age,
            CitizenIncome = request.Applicant.AnnualIncome,
            FormFields = formFields,
            AttachedDocumentNames = request.ProvidedDocuments ?? new List<string>(),
            CalculatedFee = fee.TotalAmount,
            Stage = request.Stage ?? 1,
            ProposedAppointmentDate = slot.SlotStartUtc,
            DraftedAt = DateTime.UtcNow
        };

        var blockers = unfilledRequired.Select(f => $"Required form field '{f}' could not be pre-filled from citizen data.").ToList();

        return new ActionDraftResponse(
            IsReadyForValidation: blockers.Count == 0,
            Draft: draft,
            Fee: fee,
            Appointment: slot,
            UnfilledRequiredFields: unfilledRequired,
            Blockers: blockers,
            NotesForOfficer: notes.Distinct().ToList(),
            Reasoning: reasoning,
            ToolCalls: toolCalls,
            RetrievedContextSnippets: retrievedSnippets);
    }

    private async Task<(string? reasoning, List<string>? notes)> TrySynthesizeWithAiAsync(
        ActionDraftRequest request,
        FeeCalculationResult fee,
        AppointmentSlotResult slot,
        PrefillResult prefill,
        List<string> retrievedSnippets,
        CancellationToken cancellationToken)
    {
        try
        {
            const string systemPrompt = 
                "You are Agent 3 (Action & Application Tool Agent) of the Sri Lanka Government Service Navigator platform.\n" +
                "Your objective is to review the execution results of deterministic tool calls (application form prefilling, fee calculation, and appointment scheduling) along with official statutory regulations retrieved from the vector knowledge base, and synthesize high-clarity administrative reasoning and operational notes for the verifying officer.\n\n" +
                "GUIDELINES:\n" +
                "1. Ground all notes and reasoning strictly on the provided tool results and official regulatory context.\n" +
                "2. In 'notesForOfficer': provide concise, actionable observations for the processing officer (e.g., biometric capture requirements, original document verification at counter, fee breakdown details, appointment instructions).\n" +
                "3. In 'reasoning': generate a professional administrative narrative explaining the draft application status, statutory fee basis, appointment time, and any required citizen action items.\n" +
                "4. Output ONLY a valid JSON object matching this schema:\n" +
                "{\n" +
                "  \"notesForOfficer\": [\"string\"],\n" +
                "  \"reasoning\": \"string\"\n" +
                "}";

            var userPrompt = 
                $"SERVICE: {request.ServiceName} (ID: {request.ServiceProcedureId})\n" +
                $"STAGE: {(request.Stage.HasValue ? $"Stage {request.Stage}" : "Standard Intake")}\n" +
                $"APPLICANT: {request.Applicant.FullName} (Age: {request.Applicant.Age}, Citizenship: {request.Applicant.CitizenshipStatus})\n\n" +
                $"TOOL EXECUTION RESULTS:\n" +
                $"- Fee Calculated: {fee.Currency} {fee.TotalAmount:N2} (Notes: {string.Join("; ", fee.Notes)})\n" +
                $"- Appointment Slot: {(slot.IsSlotFound ? slot.LocalDisplay : slot.Message)}\n" +
                $"- Prefilled Form Fields: {string.Join(", ", prefill.FormFields.Keys)}\n" +
                $"- Unfilled Required Fields: {(prefill.UnfilledRequiredFields.Count > 0 ? string.Join(", ", prefill.UnfilledRequiredFields) : "None")}\n" +
                $"- Unfilled Optional Fields: {(prefill.UnfilledOptionalFields.Count > 0 ? string.Join(", ", prefill.UnfilledOptionalFields) : "None")}\n" +
                $"- Provided Documents: {(request.ProvidedDocuments?.Count > 0 ? string.Join(", ", request.ProvidedDocuments) : "None")}\n\n" +
                $"STATUTORY POLICY CONTEXT (Retrieved from Neon pgvector):\n" +
                (retrievedSnippets.Count > 0 ? string.Join("\n---\n", retrievedSnippets) : "No specific regulatory context retrieved.") + "\n\n" +
                "Synthesize the officer notes and administrative reasoning JSON.";

            var jsonResult = await _llmService!.GenerateChatCompletionAsync(
                systemPrompt,
                userPrompt,
                jsonMode: true,
                cancellationToken: cancellationToken);

            if (string.IsNullOrWhiteSpace(jsonResult))
            {
                return (null, null);
            }

            using var doc = JsonDocument.Parse(jsonResult);
            var root = doc.RootElement;

            var reasoning = root.TryGetProperty("reasoning", out var reasonElem) ? reasonElem.GetString() : null;
            var notes = new List<string>();
            if (root.TryGetProperty("notesForOfficer", out var notesElem) && notesElem.ValueKind == JsonValueKind.Array)
            {
                foreach (var item in notesElem.EnumerateArray())
                {
                    var n = item.GetString();
                    if (!string.IsNullOrWhiteSpace(n)) notes.Add(n);
                }
            }

            return (reasoning, notes.Count > 0 ? notes : null);
        }
        catch
        {
            return (null, null);
        }
    }

    private static string DeterministicReasoning(
        ActionDraftRequest request,
        FeeCalculationResult fee,
        AppointmentSlotResult slot,
        List<string> unfilledRequired)
    {
        var slotText = slot.IsSlotFound ? $"proposed appointment {slot.LocalDisplay}" : "no appointment slot could be proposed";
        var fieldsText = unfilledRequired.Count == 0
            ? "all required form fields were pre-filled from the citizen profile"
            : $"required fields still missing: {string.Join(", ", unfilledRequired)}";

        return $"Draft prepared for {request.ServiceName} using allow-listed tools: fee {fee.Currency} {fee.TotalAmount:N2}; {slotText}; {fieldsText}.";
    }

    private static ToolCallRecord Record(string toolName, object input, object output) =>
        new(toolName, JsonSerializer.Serialize(input), JsonSerializer.Serialize(output), DateTime.UtcNow);

    private static string MaskNic(string nic) =>
        string.IsNullOrEmpty(nic) || nic.Length <= 4 ? "****" : new string('*', nic.Length - 4) + nic[^4..];
}
