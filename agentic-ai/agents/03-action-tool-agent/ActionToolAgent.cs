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

    public async Task<AppointmentBookingResponse> BookAppointmentAsync(
        AppointmentBookingRequest request,
        CancellationToken cancellationToken = default)
    {
        var sriLankaOffset = TimeSpan.FromHours(5.5);
        var nowLocal = new DateTimeOffset(DateTime.UtcNow, TimeSpan.Zero).ToOffset(sriLankaOffset);

        // 1. Resolve department name for the last completed stage
        var department = string.IsNullOrWhiteSpace(request.DepartmentName)
            ? ResolveDepartmentFromService(request.ServiceName)
            : request.DepartmentName;

        // 2. Parse natural language time via Groq LLM (or deterministic fallback)
        var parsedTime = await ParseNaturalLanguageTimeAsync(request.PreferredTimeInput, nowLocal, cancellationToken);

        // 3. Determine if slot is valid and free based on Department's configured slots or fallback
        bool isSunday = parsedTime.TargetDate.DayOfWeek == DayOfWeek.Sunday;
        int dayNum = (int)parsedTime.TargetDate.DayOfWeek; // 1 = Monday .. 6 = Saturday

        if (request.ConfiguredSlots != null && request.ConfiguredSlots.Count > 0)
        {
            if (isSunday)
            {
                var nextWorkingDay = parsedTime.TargetDate.AddDays(1);
                var nextDayNum = (int)nextWorkingDay.DayOfWeek;
                var nextDateStr = nextWorkingDay.ToString("dddd, dd MMM yyyy");

                var nextDaySlots = request.ConfiguredSlots
                    .Where(s => s.IsActive && s.DayOfWeek == nextDayNum && BookedOn(request, s, nextWorkingDay) < s.MaxCapacity)
                    .OrderBy(s => s.StartTime)
                    .Select(s => new SuggestedTimeSlot(
                        $"{s.StartTime.Substring(0, Math.Min(5, s.StartTime.Length))} - {s.EndTime.Substring(0, Math.Min(5, s.EndTime.Length))}",
                        $"{s.StartTime.Substring(0, Math.Min(5, s.StartTime.Length))} - {s.EndTime.Substring(0, Math.Min(5, s.EndTime.Length))} ({s.MaxCapacity - BookedOn(request, s, nextWorkingDay)} seats available) — {nextDateStr}",
                        $"{nextWorkingDay:yyyy-MM-dd} {s.StartTime.Substring(0, Math.Min(5, s.StartTime.Length))}"
                    ))
                    .ToList();

                string sunReason = $"The requested date ({parsedTime.TargetDate:dddd, dd MMM yyyy}) is a Sunday (Government Public Holiday) and {department} collection counters are closed.";
                return new AppointmentBookingResponse(
                    Success: false,
                    IsBooked: false,
                    ConfirmationCode: null,
                    BookedDate: null,
                    BookedTime: null,
                    DepartmentName: department,
                    DepartmentContact: "+94 11 286 0000",
                    DepartmentAddress: "Central Administrative Complex, Battaramulla / Colombo",
                    SuggestedSlots: nextDaySlots,
                    Message: $"Counter is closed on Sundays. Available slots for {nextDateStr} at {department} are suggested below.",
                    AgentReasoning: $"{sunReason} Agent 3 has retrieved the available open slots for {nextDateStr}. Please select one of the suggested times below.");
            }

            DepartmentSlotInfo? matchingSlot = null;
            if (dayNum >= 1 && dayNum <= 6 && parsedTime.HasTime)
            {
                var reqTs = new TimeSpan(parsedTime.Hour, parsedTime.Minute, 0);
                matchingSlot = request.ConfiguredSlots.FirstOrDefault(s =>
                {
                    if (!s.IsActive || s.DayOfWeek != dayNum) return false;
                    if (TimeSpan.TryParse(s.StartTime, out var startTs) && TimeSpan.TryParse(s.EndTime, out var endTs))
                    {
                        return reqTs >= startTs && reqTs < endTs;
                    }
                    return false;
                });
            }

            // Case A: A matching department slot exists and has free capacity
            var matchingBooked = matchingSlot == null ? 0 : BookedOn(request, matchingSlot, parsedTime.TargetDate);
            if (matchingSlot != null && matchingBooked < matchingSlot.MaxCapacity)
            {
                var code = $"SL-APT-{Random.Shared.Next(1000, 9999)}";
                var slotDisplay = $"{matchingSlot.StartTime.Substring(0, Math.Min(5, matchingSlot.StartTime.Length))} - {matchingSlot.EndTime.Substring(0, Math.Min(5, matchingSlot.EndTime.Length))}";
                var dateDisplay = parsedTime.TargetDate.ToString("dddd, dd MMM yyyy");
                int newBookedCount = matchingBooked + 1;
                int remaining = matchingSlot.MaxCapacity - newBookedCount;

                string reasoning = $"Agent 3 matched your requested time '{request.PreferredTimeInput}' with an available collection counter slot ({slotDisplay}) at {department}. Slot capacity updated: {newBookedCount}/{matchingSlot.MaxCapacity} slots filled ({remaining} remaining). Appointment confirmed under statutory booking code {code}. Both your profile and the {department} desk have received this confirmation.";

                if (_llmService != null && _llmService.IsConfigured)
                {
                    var aiReason = await SynthesizeBookingReasoningAsync(department, dateDisplay, slotDisplay, code, true, null, cancellationToken);
                    if (!string.IsNullOrWhiteSpace(aiReason)) reasoning = aiReason;
                }

                return new AppointmentBookingResponse(
                    Success: true,
                    IsBooked: true,
                    ConfirmationCode: code,
                    BookedDate: dateDisplay,
                    BookedTime: $"{slotDisplay} (Sri Lanka Time)",
                    DepartmentName: department,
                    DepartmentContact: "+94 11 286 0000",
                    DepartmentAddress: "Central Administrative Complex, Battaramulla / Colombo",
                    SuggestedSlots: new List<SuggestedTimeSlot>(),
                    Message: $"Appointment successfully confirmed at {department} for {dateDisplay} ({slotDisplay}).",
                    AgentReasoning: reasoning);
            }

            // Case B: Slot is full OR no slot configured for requested time
            var targetDay = parsedTime.TargetDate;
            var dateString = targetDay.ToString("dddd, dd MMM yyyy");

            var availableDeptSlots = request.ConfiguredSlots
                .Where(s => s.IsActive && s.DayOfWeek == dayNum && BookedOn(request, s, targetDay) < s.MaxCapacity)
                .OrderBy(s => s.StartTime)
                .Select(s => new SuggestedTimeSlot(
                    $"{s.StartTime.Substring(0, Math.Min(5, s.StartTime.Length))} - {s.EndTime.Substring(0, Math.Min(5, s.EndTime.Length))}",
                    $"{s.StartTime.Substring(0, Math.Min(5, s.StartTime.Length))} - {s.EndTime.Substring(0, Math.Min(5, s.EndTime.Length))} ({s.MaxCapacity - BookedOn(request, s, targetDay)} seats available) — {dateString}",
                    $"{targetDay:yyyy-MM-dd} {s.StartTime.Substring(0, Math.Min(5, s.StartTime.Length))}"
                ))
                .ToList();

            // If day is full, look for next available day
            if (availableDeptSlots.Count == 0)
            {
                var nextDay = targetDay.AddDays(1);
                if (nextDay.DayOfWeek == DayOfWeek.Sunday) nextDay = nextDay.AddDays(1);
                int nextDayNum = (int)nextDay.DayOfWeek;
                var nextDayStr = nextDay.ToString("dddd, dd MMM yyyy");

                availableDeptSlots = request.ConfiguredSlots
                    .Where(s => s.IsActive && s.DayOfWeek == nextDayNum && BookedOn(request, s, nextDay) < s.MaxCapacity)
                    .OrderBy(s => s.StartTime)
                    .Select(s => new SuggestedTimeSlot(
                        $"{s.StartTime.Substring(0, Math.Min(5, s.StartTime.Length))} - {s.EndTime.Substring(0, Math.Min(5, s.EndTime.Length))}",
                        $"{s.StartTime.Substring(0, Math.Min(5, s.StartTime.Length))} - {s.EndTime.Substring(0, Math.Min(5, s.EndTime.Length))} ({s.MaxCapacity - BookedOn(request, s, nextDay)} seats available) — {nextDayStr}",
                        $"{nextDay:yyyy-MM-dd} {s.StartTime.Substring(0, Math.Min(5, s.StartTime.Length))}"
                    ))
                    .ToList();
            }

            string unavailReason = matchingSlot != null
                ? $"The requested collection slot ({matchingSlot.StartTime.Substring(0, Math.Min(5, matchingSlot.StartTime.Length))} - {matchingSlot.EndTime.Substring(0, Math.Min(5, matchingSlot.EndTime.Length))}) at {department} is completely full ({matchingSlot.MaxCapacity}/{matchingSlot.MaxCapacity} appointments booked)."
                : $"The department '{department}' does not have active counter collection hours matching '{request.PreferredTimeInput}' on {targetDay:dddd}.";

            string agentAdv = $"{unavailReason} Agent 3 has retrieved the active slots with open capacity for {department}. Please select one of the suggested times below to confirm your appointment.";

            if (_llmService != null && _llmService.IsConfigured)
            {
                var aiAdvice = await SynthesizeBookingReasoningAsync(department, dateString, null, null, false, unavailReason, cancellationToken);
                if (!string.IsNullOrWhiteSpace(aiAdvice)) agentAdv = aiAdvice;
            }

            return new AppointmentBookingResponse(
                Success: false,
                IsBooked: false,
                ConfirmationCode: null,
                BookedDate: null,
                BookedTime: null,
                DepartmentName: department,
                DepartmentContact: "+94 11 286 0000",
                DepartmentAddress: "Central Administrative Complex, Battaramulla / Colombo",
                SuggestedSlots: availableDeptSlots,
                Message: $"Requested time is not available. Open slots for {department} are suggested below.",
                AgentReasoning: agentAdv);
        }

        // Fallback when no department slots are configured yet (default operating hours)
        bool isOperatingHours = parsedTime.HasTime &&
                                parsedTime.Hour >= 9 &&
                                (parsedTime.Hour < 15 || (parsedTime.Hour == 15 && parsedTime.Minute <= 30));

        // If time is within operating hours and not Sunday -> Free slot can be confirmed!
        if (!isSunday && isOperatingHours)
        {
            var code = $"SL-APT-{Random.Shared.Next(1000, 9999)}";
            var slotDisplay = $"{parsedTime.Hour:D2}:{parsedTime.Minute:D2} - {(parsedTime.Hour + (parsedTime.Minute >= 30 ? 1 : 0)):D2}:{(parsedTime.Minute >= 30 ? (parsedTime.Minute - 30) : (parsedTime.Minute + 30)):D2}";
            var dateDisplay = parsedTime.TargetDate.ToString("dddd, dd MMM yyyy");

            string reasoning = $"Agent 3 matched your requested time '{request.PreferredTimeInput}' with an available collection slot ({slotDisplay}) at {department}. Appointment confirmed under statutory booking code {code}. Both your profile and the {department} desk have received this confirmation.";

            if (_llmService != null && _llmService.IsConfigured)
            {
                var aiReason = await SynthesizeBookingReasoningAsync(department, dateDisplay, slotDisplay, code, true, null, cancellationToken);
                if (!string.IsNullOrWhiteSpace(aiReason)) reasoning = aiReason;
            }

            return new AppointmentBookingResponse(
                Success: true,
                IsBooked: true,
                ConfirmationCode: code,
                BookedDate: dateDisplay,
                BookedTime: $"{slotDisplay} (Sri Lanka Time)",
                DepartmentName: department,
                DepartmentContact: "+94 11 286 0000",
                DepartmentAddress: "Central Administrative Complex, Battaramulla / Colombo",
                SuggestedSlots: new List<SuggestedTimeSlot>(),
                Message: $"Appointment successfully confirmed for {dateDisplay} at {slotDisplay}.",
                AgentReasoning: reasoning);
        }

        // 4. Requested time is NOT available (Sunday, outside hours, or fully booked)
        var fallbackTargetDay = isSunday ? parsedTime.TargetDate.AddDays(1) : parsedTime.TargetDate;
        var fallbackDateString = fallbackTargetDay.ToString("dddd, dd MMM yyyy");

        var fallbackSuggestedSlots = new List<SuggestedTimeSlot>
        {
            new("09:30 - 10:00", $"09:30 AM (Morning Slot) — {fallbackDateString}", $"{fallbackTargetDay:yyyy-MM-dd} 09:30"),
            new("11:00 - 11:30", $"11:00 AM (Late Morning) — {fallbackDateString}", $"{fallbackTargetDay:yyyy-MM-dd} 11:00"),
            new("13:30 - 14:00", $"01:30 PM (Afternoon Slot) — {fallbackDateString}", $"{fallbackTargetDay:yyyy-MM-dd} 13:30"),
            new("14:30 - 15:00", $"02:30 PM (Late Afternoon) — {fallbackDateString}", $"{fallbackTargetDay:yyyy-MM-dd} 14:30"),
        };

        string unavailableReason = isSunday
            ? $"The requested date ({parsedTime.TargetDate:dddd, dd MMM yyyy}) is a Sunday (Government Public Holiday) and offices are closed."
            : $"The requested time '{request.PreferredTimeInput}' falls outside official counter hours (09:00 - 15:30) or is fully booked for {department}.";

        string agentAdvice = $"{unavailableReason} Agent 3 has retrieved the available open slots for {fallbackDateString}. Please select one of the suggested times below to confirm your appointment.";

        if (_llmService != null && _llmService.IsConfigured)
        {
            var aiAdvice = await SynthesizeBookingReasoningAsync(department, fallbackDateString, null, null, false, unavailableReason, cancellationToken);
            if (!string.IsNullOrWhiteSpace(aiAdvice)) agentAdvice = aiAdvice;
        }

        return new AppointmentBookingResponse(
            Success: false,
            IsBooked: false,
            ConfirmationCode: null,
            BookedDate: null,
            BookedTime: null,
            DepartmentName: department,
            DepartmentContact: "+94 11 286 0000",
            DepartmentAddress: "Central Administrative Complex, Battaramulla / Colombo",
            SuggestedSlots: fallbackSuggestedSlots,
            Message: $"Requested time is not available. Available slots for {fallbackDateString} are suggested below.",
            AgentReasoning: agentAdvice);
    }

    // Bookings for this slot on this exact date (not the slot's weekday in general)
    private static int BookedOn(AppointmentBookingRequest request, DepartmentSlotInfo slot, DateTime date) =>
        request.DateUsage == null
            ? slot.BookedCount
            : request.DateUsage.Where(u => u.SlotId == slot.Id && u.Date.Date == date.Date).Sum(u => u.Count);

    private static string ResolveDepartmentFromService(string serviceName)
    {
        var lower = serviceName.ToLowerInvariant();
        if (lower.Contains("passport") || lower.Contains("immigration"))
            return "Department of Immigration & Emigration";
        if (lower.Contains("nic") || lower.Contains("identity") || lower.Contains("registration of persons"))
            return "Department of Registration of Persons";
        if (lower.Contains("driving") || lower.Contains("license") || lower.Contains("motor"))
            return "Department of Motor Traffic";
        if (lower.Contains("police") || lower.Contains("clearance"))
            return "Sri Lanka Police Headquarters";
        if (lower.Contains("birth") || lower.Contains("marriage") || lower.Contains("death") || lower.Contains("registrar"))
            return "Registrar General's Department";

        return "Department of Public Administration";
    }

    private async Task<(DateTime TargetDate, int Hour, int Minute, bool HasTime)> ParseNaturalLanguageTimeAsync(
        string input,
        DateTimeOffset nowLocal,
        CancellationToken cancellationToken)
    {
        if (_llmService != null && _llmService.IsConfigured)
        {
            try
            {
                var prompt = $@"Current reference time in Sri Lanka (UTC+05:30): {nowLocal:yyyy-MM-dd HH:mm dddd}.
The citizen submitted: ""{input}""
Parse the citizen's preferred date and time into a JSON object:
{{
  ""targetDate"": ""yyyy-MM-dd"",
  ""hour"": 14,
  ""minute"": 30,
  ""hasTime"": true
}}
Rules:
- Never return a date in the past. If 'tomorrow', date is {nowLocal.AddDays(1):yyyy-MM-dd}.
- If user gives only day of week (e.g. 'Monday'), pick upcoming date.
- If user mentions 'morning' without exact hour, set hour=10, minute=0.
- If user mentions 'afternoon' without exact hour, set hour=14, minute=0.
- Output ONLY valid JSON.";

                var json = await _llmService.GenerateChatCompletionAsync(
                    "You are a government AI scheduling agent. Output only JSON.",
                    prompt,
                    jsonMode: true,
                    cancellationToken);

                if (!string.IsNullOrWhiteSpace(json))
                {
                    using var doc = JsonDocument.Parse(json);
                    var root = doc.RootElement;
                    if (root.TryGetProperty("targetDate", out var tdElem) &&
                        DateTime.TryParse(tdElem.GetString(), out var parsedDate))
                    {
                        int hour = root.TryGetProperty("hour", out var hElem) ? hElem.GetInt32() : 10;
                        int minute = root.TryGetProperty("minute", out var mElem) ? mElem.GetInt32() : 0;
                        bool hasTime = !root.TryGetProperty("hasTime", out var htElem) || htElem.GetBoolean();
                        return (parsedDate, hour, minute, hasTime);
                    }
                }
            }
            catch
            {
                // Fall back to deterministic
            }
        }

        // Deterministic regex parsing
        var lower = input.ToLowerInvariant();
        DateTime targetDate = nowLocal.Date.AddDays(1); // default to tomorrow
        if (lower.Contains("today")) targetDate = nowLocal.Date;
        else if (lower.Contains("tomorrow")) targetDate = nowLocal.Date.AddDays(1);
        else if (lower.Contains("monday")) targetDate = GetUpcomingDay(nowLocal.Date, DayOfWeek.Monday);
        else if (lower.Contains("tuesday")) targetDate = GetUpcomingDay(nowLocal.Date, DayOfWeek.Tuesday);
        else if (lower.Contains("wednesday")) targetDate = GetUpcomingDay(nowLocal.Date, DayOfWeek.Wednesday);
        else if (lower.Contains("thursday")) targetDate = GetUpcomingDay(nowLocal.Date, DayOfWeek.Thursday);
        else if (lower.Contains("friday")) targetDate = GetUpcomingDay(nowLocal.Date, DayOfWeek.Friday);
        else if (lower.Contains("saturday")) targetDate = GetUpcomingDay(nowLocal.Date, DayOfWeek.Saturday);

        int targetHour = 10;
        int targetMinute = 0;
        bool detectedTime = false;

        var timeMatch = System.Text.RegularExpressions.Regex.Match(input, @"(\d{1,2})(?::(\d{2}))?\s*(am|pm)?", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
        if (timeMatch.Success)
        {
            if (int.TryParse(timeMatch.Groups[1].Value, out var h))
            {
                var isPm = timeMatch.Groups[3].Value.Equals("pm", StringComparison.OrdinalIgnoreCase);
                var isAm = timeMatch.Groups[3].Value.Equals("am", StringComparison.OrdinalIgnoreCase);
                if (isPm && h < 12) h += 12;
                if (isAm && h == 12) h = 0;
                targetHour = h;
                detectedTime = true;
            }
            if (timeMatch.Groups[2].Success && int.TryParse(timeMatch.Groups[2].Value, out var m))
            {
                targetMinute = m;
            }
        }
        else if (lower.Contains("morning"))
        {
            targetHour = 10;
            detectedTime = true;
        }
        else if (lower.Contains("afternoon"))
        {
            targetHour = 14;
            detectedTime = true;
        }

        return (targetDate, targetHour, targetMinute, detectedTime);
    }

    private static DateTime GetUpcomingDay(DateTime start, DayOfWeek target)
    {
        var d = start.AddDays(1);
        while (d.DayOfWeek != target) d = d.AddDays(1);
        return d;
    }

    private async Task<string?> SynthesizeBookingReasoningAsync(
        string department,
        string dateDisplay,
        string? slotDisplay,
        string? code,
        bool isConfirmed,
        string? unavailableNote,
        CancellationToken cancellationToken)
    {
        try
        {
            var prompt = isConfirmed
                ? $"The citizen requested an appointment at {department}. Agent 3 successfully verified a free counter slot on {dateDisplay} at {slotDisplay}. The confirmation code is {code}. Synthesize a professional, concise 2-sentence confirmation message from Agent 3 reassuring the citizen that the department has received this booking."
                : $"The citizen requested an appointment at {department} on {dateDisplay}, but the requested time is not available ({unavailableNote}). Synthesize a helpful 2-sentence message explaining the reason and suggesting the available alternative slots for that date.";

            return await _llmService!.GenerateChatCompletionAsync(
                "You are Agent 3 (Appointment Scheduling Agent). Be professional, reassuring, and concise.",
                prompt,
                jsonMode: false,
                cancellationToken);
        }
        catch
        {
            return null;
        }
    }

    private static ToolCallRecord Record(string toolName, object input, object output) =>
        new(toolName, JsonSerializer.Serialize(input), JsonSerializer.Serialize(output), DateTime.UtcNow);

    private static string MaskNic(string nic) =>
        string.IsNullOrEmpty(nic) || nic.Length <= 4 ? "****" : new string('*', nic.Length - 4) + nic[^4..];
}
