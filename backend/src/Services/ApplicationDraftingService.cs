using System.Globalization;
using System.Text.Json;
using Government_Service_Navigator.AgenticAi.Agents.ActionToolAgent;
using Government_Service_Navigator.AgenticAi.Agents.ActionToolAgent.DTOs;
using Government_Service_Navigator.AgenticAi.Agents.EligibilityDocumentAgent;
using Government_Service_Navigator.AgenticAi.Agents.EligibilityDocumentAgent.DTOs;
using Government_Service_Navigator.AgenticAi.Agents.ValidationSafety;
using Government_Service_Navigator.AgenticAi.Schemas;
using Government_Service_Navigator.AgenticAi.Tools.PrefillApplication;
using Government_Service_Navigator.Backend.Data.Context;
using Government_Service_Navigator.Backend.Models.Entities;
using Microsoft.EntityFrameworkCore;

namespace Government_Service_Navigator.Backend.Services;

// What the Verifying Officer's workspace shows for an application: Agent 2's eligibility result
// and Agent 3's draft (pre-filled fields, fee, proposed appointment, tool calls).
public record AgentDraftView(
    int ApplicationId,
    DateTime GeneratedAt,
    int? DerivedAgeFromNic,
    EligibilityPlanResponse Eligibility,
    ActionDraftResponse Action,
    ValidationResult? Validation = null);

public interface IApplicationDraftingService
{
    Task<AgentDraftView?> GetStoredDraftAsync(int applicationId, CancellationToken cancellationToken = default);

    /// <summary>Runs Agent 2 then Agent 3 on a submitted application and stores the result. Null if the submission doesn't exist.</summary>
    Task<AgentDraftView?> GenerateDraftAsync(int applicationId, CancellationToken cancellationToken = default);
}

public class ApplicationDraftingService : IApplicationDraftingService
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    // Footer keys ApplicationsController writes server-side; they describe the department, not the citizen.
    private static readonly string[] DepartmentFooterKeys = { "Presented by", "Email" };

    private readonly AppDbContext _context;
    private readonly IEligibilityDocumentAgent _eligibilityAgent;
    private readonly IActionToolAgent _actionAgent;
    private readonly IValidationSafetyAgent _safetyAgent;

    public ApplicationDraftingService(
        AppDbContext context,
        IEligibilityDocumentAgent eligibilityAgent,
        IActionToolAgent actionAgent,
        IValidationSafetyAgent safetyAgent)
    {
        _context = context;
        _eligibilityAgent = eligibilityAgent;
        _actionAgent = actionAgent;
        _safetyAgent = safetyAgent;
    }

    public async Task<AgentDraftView?> GetStoredDraftAsync(int applicationId, CancellationToken cancellationToken = default)
    {
        var stored = await _context.AgentDrafts.FirstOrDefaultAsync(d => d.ApplicationId == applicationId, cancellationToken);
        if (stored == null) return null;

        try { return JsonSerializer.Deserialize<AgentDraftView>(stored.DraftJson, JsonOptions); }
        catch (JsonException) { return null; } // stale shape — caller regenerates
    }

    public async Task<AgentDraftView?> GenerateDraftAsync(int applicationId, CancellationToken cancellationToken = default)
    {
        var submission = await _context.ApplicationSubmissions
            .Include(s => s.ServiceProcedure)
            .FirstOrDefaultAsync(s => s.Id == applicationId, cancellationToken);
        if (submission?.ServiceProcedure == null) return null;

        Dictionary<string, string> answers;
        try { answers = JsonSerializer.Deserialize<Dictionary<string, string>>(submission.FormDataJson) ?? new(); }
        catch (JsonException) { answers = new(); }

        var citizenAnswers = answers
            .Where(kv => !DepartmentFooterKeys.Contains(kv.Key) && !string.IsNullOrWhiteSpace(kv.Value))
            .ToDictionary(kv => kv.Key, kv => kv.Value.Trim());

        // Documents = uploaded files, labelled with the requirement / file field they were uploaded for
        var providedDocuments = await _context.SubmissionDocuments
            .Where(d => d.ApplicationId == submission.Id)
            .OrderBy(d => d.UploadedAt)
            .Select(d => d.FieldLabel + ": " + d.FileName)
            .ToListAsync(cancellationToken);

        // Applications submitted before uploads existed: answers to the template's "file" fields
        if (providedDocuments.Count == 0 && submission.TemplateId.HasValue)
        {
            var fileLabels = await _context.FormFields
                .Where(f => f.TemplateId == submission.TemplateId.Value && f.Type == "file")
                .Select(f => f.Label)
                .ToListAsync(cancellationToken);
            providedDocuments = fileLabels
                .Where(citizenAnswers.ContainsKey)
                .Select(l => $"{l}: {citizenAnswers[l]}")
                .ToList();
        }

        var fullName = await _context.Users
            .Where(u => u.NicNumber == submission.CitizenNic)
            .Select(u => u.FullName)
            .FirstOrDefaultAsync(cancellationToken);

        var derivedAge = AgeFromNic(submission.CitizenNic, DateTime.UtcNow);
        var age = derivedAge ?? (int.TryParse(FindAnswer(citizenAnswers, "age"), out var a) ? a : 0);
        decimal.TryParse(FindAnswer(citizenAnswers, "income", "salary"), NumberStyles.Any, CultureInfo.InvariantCulture, out var income);

        var profile = new CitizenProfile
        {
            Age = age,
            CitizenshipStatus = FindAnswer(citizenAnswers, "citizenship", "nationality") ?? "Sri Lankan",
            AnnualIncome = income,
            EmploymentStatus = FindAnswer(citizenAnswers, "employment", "occupation") ?? string.Empty,
            ProvidedDocuments = providedDocuments,
            AdditionalAttributes = citizenAnswers
        };

        var service = submission.ServiceProcedure;

        // Agent 2 → Agent 3 with CurrentStage context
        var currentStage = submission.CurrentStage > 0 ? submission.CurrentStage : 1;
        var eligibility = await _eligibilityAgent.EvaluateEligibilityAsync(
            new EligibilityPlanRequest(service.Name, service.Id, profile, Stage: currentStage), cancellationToken);

        var action = await _actionAgent.PrepareDraftAsync(new ActionDraftRequest(
            ApplicationId: submission.Id,
            ServiceProcedureId: service.Id,
            ServiceName: service.Name,
            Applicant: new ApplicantDetails
            {
                CitizenNic = submission.CitizenNic,
                FullName = fullName ?? FindAnswer(citizenAnswers, "full name", "name") ?? string.Empty,
                Email = submission.UserEmail,
                Age = profile.Age,
                CitizenshipStatus = profile.CitizenshipStatus,
                AnnualIncome = profile.AnnualIncome,
                EmploymentStatus = profile.EmploymentStatus,
                AdditionalAttributes = citizenAnswers
            },
            Eligibility: eligibility,
            ProvidedDocuments: providedDocuments,
            Stage: currentStage), cancellationToken);
        var draftForValidation = action.Draft ?? new DraftApplication
        {
            ApplicationId = submission.Id,
            ServiceProcedureId = service.Id,
            ServiceName = service.Name,
            CitizenNic = submission.CitizenNic,
            CitizenName = fullName ?? FindAnswer(citizenAnswers, "full name", "name") ?? submission.CitizenNic,
            CitizenAge = profile.Age,
            CitizenIncome = profile.AnnualIncome,
            CalculatedFee = action.Fee?.TotalAmount ?? 0m,
            FormFields = citizenAnswers,
            AttachedDocumentNames = providedDocuments,
            Stage = currentStage,
            MaxStages = submission.MaxStages > 0 ? submission.MaxStages : 1,
            DepartmentName = submission.CurrentDepartment ?? service.Category ?? "Government Service"
        };

        var validation = await _safetyAgent.ValidateAndEnqueueAsync(draftForValidation, eligibility.RequiredDocuments, cancellationToken);

        var view = new AgentDraftView(submission.Id, DateTime.UtcNow, derivedAge, eligibility, action, validation);

        var stored = await _context.AgentDrafts.FirstOrDefaultAsync(d => d.ApplicationId == submission.Id, cancellationToken);
        if (stored == null)
        {
            stored = new AgentDraft { ApplicationId = submission.Id };
            _context.AgentDrafts.Add(stored);
        }
        stored.DraftJson = JsonSerializer.Serialize(view, JsonOptions);
        stored.CreatedAt = view.GeneratedAt;
        await _context.SaveChangesAsync(cancellationToken);

        return view;
    }

    private static string? FindAnswer(Dictionary<string, string> answers, params string[] keywords) =>
        answers.FirstOrDefault(kv => keywords.Any(k => kv.Key.Contains(k, StringComparison.OrdinalIgnoreCase))).Value;

    /// <summary>
    /// Sri Lankan NICs encode the birth date: old format YYDDDnnnnV / new format YYYYDDDnnnnn,
    /// where DDD is the day of the year (+500 for women).
    /// </summary>
    public static int? AgeFromNic(string nic, DateTime today)
    {
        nic = (nic ?? string.Empty).Trim();
        int year, dayOfYear;

        if (nic.Length == 12 && nic.All(char.IsDigit))
        {
            year = int.Parse(nic[..4]);
            dayOfYear = int.Parse(nic.Substring(4, 3));
        }
        else if (nic.Length == 10 && nic[..9].All(char.IsDigit) && "vVxX".Contains(nic[9]))
        {
            year = 1900 + int.Parse(nic[..2]);
            dayOfYear = int.Parse(nic.Substring(2, 3));
        }
        else return null;

        if (dayOfYear > 500) dayOfYear -= 500;
        if (dayOfYear < 1 || dayOfYear > 366 || year < 1900 || year > today.Year) return null;

        // NIC day numbers assume a 366-day year (29 Feb always counted)
        var birthDate = new DateTime(2000, 1, 1).AddDays(dayOfYear - 1);
        var birthMonth = birthDate.Month;
        var birthDay = Math.Min(birthDate.Day, DateTime.DaysInMonth(year, birthMonth));

        var age = today.Year - year;
        if (today.Month < birthMonth || (today.Month == birthMonth && today.Day < birthDay)) age--;
        return age;
    }
}
