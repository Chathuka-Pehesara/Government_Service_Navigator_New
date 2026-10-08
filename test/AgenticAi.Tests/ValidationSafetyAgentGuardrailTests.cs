using Government_Service_Navigator.AgenticAi.Agents.ValidationSafety;
using Government_Service_Navigator.AgenticAi.Config;
using Government_Service_Navigator.AgenticAi.Schemas;
using Government_Service_Navigator.AgenticAi.Tools.CheckDuplicateApplication;
using Government_Service_Navigator.AgenticAi.Tools.ValidateSchema;
using Xunit;

namespace Government_Service_Navigator.AgenticAi.Tests;

/// <summary>
/// Agent 4 behaviour beyond the golden cases: the LLM consistency-flag filter, duplicates as a
/// flag rather than a block, PII masking, the fee gate and task enqueueing.
/// </summary>
public class ValidationSafetyAgentGuardrailTests
{
    private static readonly List<string> RequiredDocs = new() { "Identity Document" };

    public ValidationSafetyAgentGuardrailTests() => DuplicateCheckTool.ClearRegistry();

    private static DraftApplication Draft(int applicationId = 77) => new()
    {
        ApplicationId = applicationId,
        ServiceProcedureId = 3,
        ServiceName = "Police Clearance",
        CitizenNic = "199012345678",
        CitizenName = "Ruwan Jayasinghe",
        CitizenAge = 36,
        CalculatedFee = 1500m,
        Stage = 1,
        MaxStages = 1,
        AttachedDocumentNames = new() { "National Identity Card: nic.pdf" },
        FormFields = new() { ["Full name"] = "Ruwan Jayasinghe" }
    };

    private static string LlmAnswer(params string[] flags) =>
        System.Text.Json.JsonSerializer.Serialize(new
        {
            riskLevel = "Low",
            isSemanticallyConsistent = flags.Length == 0,
            executiveSummary = "Summary.",
            officerBriefing = "• Briefing line.",
            inconsistencies = flags
        });

    private static ValidationSafetyAgent Agent(
        FixedLlmService? llm = null,
        RecordingTaskEnqueuer? enqueuer = null,
        ValidationSafetyConfig? config = null,
        IDuplicateApplicationRepository? repository = null) =>
        new(new SchemaValidatorTool(), new DuplicateCheckTool(repository), enqueuer, llm, config);

    [Fact]
    public async Task NullDraft_IsRejected()
    {
        var result = await Agent().ValidateAndEnqueueAsync(null!);

        Assert.False(result.IsValid);
        Assert.Equal("Rejected", result.Decision);
    }

    [Fact]
    public async Task ValidDraft_IsEnqueuedForTheOfficer_WithTheAgentId()
    {
        var enqueuer = new RecordingTaskEnqueuer();

        var result = await Agent(enqueuer: enqueuer).ValidateAndEnqueueAsync(Draft(), RequiredDocs);

        Assert.True(result.IsValid);
        Assert.Equal("EnqueuedForOfficer", result.Decision);
        Assert.Equal(501, result.VerificationTaskId);
        var call = Assert.Single(enqueuer.Calls);
        Assert.Equal(77, call.ApplicationId);
        Assert.Equal("199012345678", call.CitizenNic);
        Assert.Equal("AGENT-04-VALIDATION-SAFETY", call.AgentId);
    }

    [Fact]
    public async Task DraftWithoutAnApplicationId_IsValidatedButNotEnqueued()
    {
        var enqueuer = new RecordingTaskEnqueuer();

        var result = await Agent(enqueuer: enqueuer).ValidateAndEnqueueAsync(Draft(applicationId: 0), RequiredDocs);

        Assert.True(result.IsValid);
        Assert.Empty(enqueuer.Calls);
    }

    [Fact]
    public async Task RejectedDraft_IsNeverEnqueued()
    {
        var enqueuer = new RecordingTaskEnqueuer();
        var draft = Draft();
        draft.CitizenNic = "bad";

        var result = await Agent(enqueuer: enqueuer).ValidateAndEnqueueAsync(draft, RequiredDocs);

        Assert.False(result.IsValid);
        Assert.Equal("High", result.RiskLevel);
        Assert.Empty(enqueuer.Calls);
    }

    [Fact]
    public async Task NegativeFee_IsRejected()
    {
        var draft = Draft();
        draft.CalculatedFee = -1m;

        var result = await Agent().ValidateAndEnqueueAsync(draft, RequiredDocs);

        Assert.Contains(result.RejectionReasons, r => r.StartsWith("FEE-001"));
    }

    [Fact]
    public async Task ZeroFee_IsAllowed()
    {
        var draft = Draft();
        draft.CalculatedFee = 0m;

        Assert.True((await Agent().ValidateAndEnqueueAsync(draft, RequiredDocs)).IsValid);
    }

    [Fact]
    public async Task Duplicate_IsRejected_WhenBlockingIsOn()
    {
        var repo = new FakeDuplicateRepository();
        repo.Active.Add(("199012345678", 3));

        var result = await Agent(repository: repo).ValidateAndEnqueueAsync(Draft(), RequiredDocs);

        Assert.False(result.IsValid);
        Assert.Contains(result.RejectionReasons, r => r.StartsWith("DUP-002"));
    }

    // Duplicates are always rejected; BlockDuplicateSubmissions no longer changes that
    [Fact]
    public async Task Duplicate_IsRejected_EvenWhenBlockingIsOff()
    {
        var repo = new FakeDuplicateRepository();
        repo.Active.Add(("199012345678", 3));
        var config = new ValidationSafetyConfig { BlockDuplicateSubmissions = false };

        var result = await Agent(config: config, repository: repo).ValidateAndEnqueueAsync(Draft(), RequiredDocs);

        Assert.False(result.IsValid);
        Assert.Contains(result.ComplianceChecks, c => c.CheckType == "Anti-Fraud Duplicate Application Check" && !c.IsPassed);
    }

    [Fact]
    public async Task CardNumbersAndSecrets_AreMaskedInTheSanitizedAnswers()
    {
        var draft = Draft();
        draft.FormFields = new()
        {
            ["Full name"] = "Ruwan Jayasinghe",
            ["Payment"] = "card 4111 1111 1111 1111 please",
            ["Notes"] = "password: hunter2",
            ["Plain"] = "nothing secret"
        };

        var result = await Agent().ValidateAndEnqueueAsync(draft, RequiredDocs);

        Assert.Equal("card [REDACTED_PAYMENT_CARD] please", result.SanitizedFormFields["Payment"]);
        Assert.Equal("password: [REDACTED_SECRET]", result.SanitizedFormFields["Notes"]);
        Assert.Equal("nothing secret", result.SanitizedFormFields["Plain"]);
        Assert.Contains(result.ComplianceChecks, c => c.CheckType == "Data Privacy & PII Sanitization" && c.Details.Contains("2"));
    }

    [Fact]
    public async Task Llm_GenuineInconsistency_RejectsTheSubmission()
    {
        var llm = new FixedLlmService(LlmAnswer("Declared age contradicts the date of birth on the certificate"));

        var result = await Agent(llm).ValidateAndEnqueueAsync(Draft(), RequiredDocs);

        Assert.False(result.IsValid);
        Assert.Contains("INCONSISTENCY-FLAG: Declared age contradicts the date of birth on the certificate", result.RejectionReasons);
        Assert.NotEqual("Low", result.RiskLevel);
    }

    [Theory]
    [InlineData("Department field is empty")]
    [InlineData("A bank deposit slip was uploaded but is not required")]
    [InlineData("Extra document attached")]
    [InlineData("Additional upload present")]
    [InlineData("Payment receipt present")]
    [InlineData("MaxStages value differs from stage value")]
    [InlineData("AttachedDocumentNames contains duplicate entries")]
    [InlineData("Filename is ambiguous")]
    [InlineData("Missing NIC document")]
    public async Task Llm_KnownFalsePositiveFlags_AreFilteredOut(string flag)
    {
        var llm = new FixedLlmService(LlmAnswer(flag));

        var result = await Agent(llm).ValidateAndEnqueueAsync(Draft(), RequiredDocs);

        Assert.True(result.IsValid);
        Assert.DoesNotContain(result.RejectionReasons, r => r.StartsWith("INCONSISTENCY-FLAG"));
        Assert.Contains(result.ComplianceChecks, c => c.CheckType == "Semantic Consistency Audit" && c.IsPassed);
    }

    [Fact]
    public async Task Llm_MissingNicFlag_IsKept_WhenNoNicIsAttachedOrAnswered()
    {
        var draft = Draft();
        draft.AttachedDocumentNames = new() { "Passport: pp.pdf" };
        draft.FormFields = new() { ["Full name"] = "Ruwan Jayasinghe" };
        var llm = new FixedLlmService(LlmAnswer("Missing NIC document"));

        var result = await Agent(llm).ValidateAndEnqueueAsync(draft, RequiredDocs);

        Assert.False(result.IsValid);
    }

    [Fact]
    public async Task Llm_RepeatedFlags_AreReportedOnce()
    {
        var llm = new FixedLlmService(LlmAnswer("Name mismatch with certificate", "name MISMATCH with certificate", " "));

        var result = await Agent(llm).ValidateAndEnqueueAsync(Draft(), RequiredDocs);

        Assert.Single(result.RejectionReasons, r => r.StartsWith("INCONSISTENCY-FLAG"));
    }

    [Fact]
    public async Task Llm_CleanAnswer_KeepsLowRisk_AndUsesItsBriefing()
    {
        var llm = new FixedLlmService(LlmAnswer());

        var result = await Agent(llm).ValidateAndEnqueueAsync(Draft(), RequiredDocs);

        Assert.True(result.IsValid);
        Assert.Equal("Low", result.RiskLevel);
        Assert.Equal("• Briefing line.", result.OfficerBriefing);
    }

    [Fact]
    public async Task Llm_PromptIncludesTheStage()
    {
        var llm = new FixedLlmService(LlmAnswer());
        var draft = Draft();
        draft.Stage = 2;
        draft.MaxStages = 3;

        await Agent(llm).ValidateAndEnqueueAsync(draft, RequiredDocs);

        Assert.Contains(llm.UserPrompts, p => p.Contains("Stage 2 of 3"));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("not json at all")]
    public async Task Llm_FailureOrGarbage_FallsBackToTheDeterministicResult(string? answer)
    {
        var llm = new FixedLlmService(answer);

        var result = await Agent(llm).ValidateAndEnqueueAsync(Draft(), RequiredDocs);

        Assert.True(result.IsValid);
        Assert.False(string.IsNullOrWhiteSpace(result.OfficerBriefing));
    }

    [Fact]
    public async Task Llm_NotConfigured_IsNeverCalled()
    {
        var llm = new FixedLlmService(LlmAnswer("Anything"), isConfigured: false);

        var result = await Agent(llm).ValidateAndEnqueueAsync(Draft(), RequiredDocs);

        Assert.True(result.IsValid);
        Assert.Empty(llm.UserPrompts);
    }

    [Fact]
    public async Task Llm_CannotClearADeterministicFailure()
    {
        var llm = new FixedLlmService(LlmAnswer());
        var draft = Draft();
        draft.CitizenAge = 12;

        var result = await Agent(llm).ValidateAndEnqueueAsync(draft, RequiredDocs);

        Assert.False(result.IsValid);
        Assert.Contains(result.RejectionReasons, r => r.StartsWith("SCHEMA-AGE-002"));
    }
}
