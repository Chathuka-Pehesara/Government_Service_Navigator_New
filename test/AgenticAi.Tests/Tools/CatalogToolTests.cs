using Government_Service_Navigator.AgenticAi.Tools.CalculateFee;
using Government_Service_Navigator.AgenticAi.Tools.CheckEligibilityRules;
using Government_Service_Navigator.AgenticAi.Tools.FindAppointmentSlot;
using Government_Service_Navigator.AgenticAi.Tools.GetDocumentRequirements;
using Government_Service_Navigator.AgenticAi.Tools.PrefillApplication;
using Xunit;

namespace Government_Service_Navigator.AgenticAi.Tests.Tools;

public class CheckEligibilityRulesToolTests
{
    private readonly CheckEligibilityRulesTool _tool = new();

    [Fact]
    public void AdultSriLankan_IsFullyEligible()
    {
        var result = _tool.EvaluateRules(1, 30, "Sri Lankan");

        Assert.True(result.IsEligible);
        Assert.Equal(100, result.ScorePercentage);
        Assert.Empty(result.MissingCriteria);
    }

    [Fact]
    public void Minor_IsNotEligible()
    {
        var result = _tool.EvaluateRules(1, 17, "Sri Lankan");

        Assert.False(result.IsEligible);
        Assert.Equal(50, result.ScorePercentage);
        Assert.Contains(result.MissingCriteria, c => c.Contains("18"));
    }

    [Fact]
    public void Exactly18_IsEligible()
    {
        Assert.True(_tool.EvaluateRules(1, 18, "Sri Lankan").IsEligible);
    }

    [Theory]
    [InlineData("Indian")]
    [InlineData("")]
    [InlineData(null)]
    public void ForeignOrUnknownCitizenship_LowersScore_ButStaysEligible(string? citizenship)
    {
        var result = _tool.EvaluateRules(1, 30, citizenship!);

        Assert.True(result.IsEligible);
        Assert.Equal(70, result.ScorePercentage);
        Assert.Single(result.MissingCriteria);
    }

    [Fact]
    public void CitizenshipMatch_IsCaseInsensitive()
    {
        Assert.Equal(100, _tool.EvaluateRules(1, 30, "SRI LANKAN citizen").ScorePercentage);
    }

    [Fact]
    public void ForeignMinor_FailsBothRules()
    {
        var result = _tool.EvaluateRules(1, 10, "Other");

        Assert.False(result.IsEligible);
        Assert.Equal(20, result.ScorePercentage);
        Assert.Equal(2, result.MissingCriteria.Count);
    }
}

public class CalculateFeeToolTests
{
    private sealed class FeeRepo : IFeeScheduleRepository
    {
        public List<FeeScheduleEntry> Fees { get; } = new();
        public int? LastStage { get; private set; }

        public Task<List<FeeScheduleEntry>> GetFeeSchedulesAsync(int serviceProcedureId, int? stage = null, CancellationToken cancellationToken = default)
        {
            LastStage = stage;
            return Task.FromResult(Fees);
        }
    }

    private static readonly DateTime Now = new(2026, 6, 1, 0, 0, 0, DateTimeKind.Utc);

    [Fact]
    public async Task NoRepository_ReturnsZeroWithANote()
    {
        var result = await new CalculateFeeTool().CalculateAsync(1);

        Assert.Equal(0m, result.TotalAmount);
        Assert.Contains(result.Notes, n => n.Contains("officer"));
    }

    [Fact]
    public async Task SumsAllFeesInForce()
    {
        var repo = new FeeRepo();
        repo.Fees.Add(new("Application Fee", 3500m, Now.AddYears(-1)));
        repo.Fees.Add(new("Printing Fee", 500m, Now.AddDays(-1)));

        var result = await new CalculateFeeTool(repo).CalculateAsync(1, asOf: Now);

        Assert.Equal(4000m, result.TotalAmount);
        Assert.Equal(2, result.LineItems.Count);
        Assert.Equal("LKR", result.Currency);
    }

    [Fact]
    public async Task FutureFee_IsNotCharged()
    {
        var repo = new FeeRepo();
        repo.Fees.Add(new("Application Fee", 3500m, Now.AddDays(1)));

        var result = await new CalculateFeeTool(repo).CalculateAsync(1, asOf: Now);

        Assert.Equal(0m, result.TotalAmount);
        Assert.Contains(result.Notes, n => n.Contains("free of charge"));
    }

    [Fact]
    public async Task FeeWithNoEffectiveDate_IsAlwaysInForce()
    {
        var repo = new FeeRepo();
        repo.Fees.Add(new("Application Fee", 2000m, default));

        var result = await new CalculateFeeTool(repo).CalculateAsync(1, asOf: Now);

        Assert.Equal(2000m, result.TotalAmount);
    }

    [Fact]
    public async Task SeveralRevisions_UsesTheLatestInForce_MatchingNamesLoosely()
    {
        var repo = new FeeRepo();
        repo.Fees.Add(new("Application Fee", 1000m, Now.AddYears(-2)));
        repo.Fees.Add(new(" application fee ", 1500m, Now.AddYears(-1)));
        repo.Fees.Add(new("Application Fee", 9999m, Now.AddYears(1)));

        var result = await new CalculateFeeTool(repo).CalculateAsync(1, asOf: Now);

        Assert.Equal(1500m, Assert.Single(result.LineItems).Amount);
    }

    [Theory]
    [InlineData("Express Processing")]
    [InlineData("Urgent Service")]
    [InlineData("Fast Track")]
    [InlineData("One Day Service")]
    public async Task ExpressFee_OnlyChargedWhenRequested(string feeType)
    {
        var repo = new FeeRepo();
        repo.Fees.Add(new("Standard", 3000m, Now.AddYears(-1)));
        repo.Fees.Add(new(feeType, 5000m, Now.AddYears(-1)));
        var tool = new CalculateFeeTool(repo);

        var standard = await tool.CalculateAsync(1, expressProcessing: false, asOf: Now);
        var express = await tool.CalculateAsync(1, expressProcessing: true, asOf: Now);

        Assert.Equal(3000m, standard.TotalAmount);
        Assert.Contains(standard.Notes, n => n.Contains(feeType));
        Assert.Equal(8000m, express.TotalAmount);
    }

    [Fact]
    public async Task PassesTheStageToTheRepository()
    {
        var repo = new FeeRepo();

        await new CalculateFeeTool(repo).CalculateAsync(1, stage: 2);

        Assert.Equal(2, repo.LastStage);
    }
}

public class FindAppointmentSlotToolTests
{
    private static readonly TimeSpan SriLanka = TimeSpan.FromHours(5.5);
    private readonly FindAppointmentSlotTool _tool = new();

    public FindAppointmentSlotToolTests() => FindAppointmentSlotTool.ClearProposedSlots();

    private static DateTimeOffset Local(DateTime utc) => new DateTimeOffset(utc, TimeSpan.Zero).ToOffset(SriLanka);

    [Fact]
    public async Task FirstSlot_IsTwoWorkingDaysOut_AtNineLocal()
    {
        // Monday 1 June 2026, 10:00 Sri Lanka time
        var now = new DateTime(2026, 6, 1, 4, 30, 0, DateTimeKind.Utc);

        var result = await _tool.FindSlotAsync(1, nowUtc: now);

        Assert.True(result.IsSlotFound);
        var start = Local(result.SlotStartUtc!.Value);
        Assert.Equal(new DateTime(2026, 6, 3), start.Date);
        Assert.Equal(new TimeSpan(9, 0, 0), start.TimeOfDay);
        Assert.Equal(TimeSpan.FromMinutes(30), result.SlotEndUtc!.Value - result.SlotStartUtc!.Value);
    }

    [Fact]
    public async Task LeadTime_SkipsTheWeekend()
    {
        // Thursday 4 June 2026 -> Friday is day 1, Monday is day 2
        var now = new DateTime(2026, 6, 4, 4, 30, 0, DateTimeKind.Utc);

        var result = await _tool.FindSlotAsync(1, nowUtc: now);

        Assert.Equal(new DateTime(2026, 6, 8), Local(result.SlotStartUtc!.Value).Date);
    }

    [Fact]
    public async Task PreferredDate_IsUsedWhenLaterThanTheLeadTime()
    {
        var now = new DateTime(2026, 6, 1, 4, 30, 0, DateTimeKind.Utc);
        var preferred = new DateTime(2026, 6, 10, 0, 0, 0, DateTimeKind.Utc);

        var result = await _tool.FindSlotAsync(1, preferred, now);

        Assert.Equal(new DateTime(2026, 6, 10), Local(result.SlotStartUtc!.Value).Date);
    }

    [Fact]
    public async Task PreferredDateTooSoon_FallsBackToTheLeadTime()
    {
        var now = new DateTime(2026, 6, 1, 4, 30, 0, DateTimeKind.Utc);

        var result = await _tool.FindSlotAsync(1, now, now);

        Assert.Equal(new DateTime(2026, 6, 3), Local(result.SlotStartUtc!.Value).Date);
    }

    [Fact]
    public async Task PreferredWeekend_MovesToMonday()
    {
        var now = new DateTime(2026, 6, 1, 4, 30, 0, DateTimeKind.Utc);
        var saturday = new DateTime(2026, 6, 13, 0, 0, 0, DateTimeKind.Utc);

        var result = await _tool.FindSlotAsync(1, saturday, now);

        Assert.Equal(DayOfWeek.Monday, Local(result.SlotStartUtc!.Value).DayOfWeek);
    }

    [Fact]
    public async Task ConsecutiveRequests_GetDifferentSlots_AndStayInOfficeHours()
    {
        var now = new DateTime(2026, 6, 1, 4, 30, 0, DateTimeKind.Utc);
        var starts = new List<DateTimeOffset>();

        // A day has 12 half-hour slots between 09:00 and 15:00, so the 13th moves to the next day
        for (var i = 0; i < 13; i++)
        {
            starts.Add(Local((await _tool.FindSlotAsync(1, nowUtc: now)).SlotStartUtc!.Value));
        }

        Assert.Equal(starts.Count, starts.Distinct().Count());
        Assert.All(starts, s =>
        {
            Assert.True(s.TimeOfDay >= new TimeSpan(9, 0, 0));
            Assert.True(s.TimeOfDay <= new TimeSpan(14, 30, 0));
        });
        Assert.Equal(new TimeSpan(14, 30, 0), starts[11].TimeOfDay);
        Assert.Equal(new DateTime(2026, 6, 4), starts[12].Date);
    }

    [Fact]
    public async Task DifferentServices_HaveIndependentSlots()
    {
        var now = new DateTime(2026, 6, 1, 4, 30, 0, DateTimeKind.Utc);

        var a = await _tool.FindSlotAsync(1, nowUtc: now);
        var b = await _tool.FindSlotAsync(2, nowUtc: now);

        Assert.Equal(a.SlotStartUtc, b.SlotStartUtc);
    }

    [Fact]
    public async Task ProposedSlot_SaysItNeedsOfficerApproval()
    {
        var result = await _tool.FindSlotAsync(1, nowUtc: new DateTime(2026, 6, 1, 4, 30, 0, DateTimeKind.Utc));

        Assert.Contains("pending Verifying Officer approval", result.Message);
        Assert.Contains("Sri Lanka Time", result.LocalDisplay);
    }
}

public class PrefillApplicationToolTests
{
    private sealed class TemplateRepo : IApplicationTemplateRepository
    {
        public List<FormFieldDefinition> Fields { get; } = new();

        public Task<List<FormFieldDefinition>> GetFormFieldsAsync(int serviceProcedureId, int? stage = null, CancellationToken cancellationToken = default)
            => Task.FromResult(Fields);
    }

    private static ApplicantDetails Applicant() => new()
    {
        CitizenNic = "200012345678",
        FullName = "Nimal Silva",
        Email = "nimal@example.lk",
        Age = 30,
        CitizenshipStatus = "Sri Lankan",
        AnnualIncome = 1200000m,
        EmploymentStatus = "Employed"
    };

    [Fact]
    public async Task NoTemplate_UsesTheDefaultTemplate()
    {
        var result = await new PrefillApplicationTool().PrefillAsync(1, Applicant());

        Assert.True(result.UsedDefaultTemplate);
        Assert.Equal("Nimal Silva", result.FormFields["Full Name"]);
        Assert.Equal("200012345678", result.FormFields["NIC Number"]);
        Assert.Equal("30", result.FormFields["Age"]);
        Assert.Equal("1200000", result.FormFields["Annual Income"]);
        Assert.Empty(result.UnfilledRequiredFields);
    }

    [Theory]
    [InlineData("National Identity Card Number", "200012345678")]
    [InlineData("E-mail Address", "nimal@example.lk")]
    [InlineData("Applicant Name", "Nimal Silva")]
    [InlineData("Nationality", "Sri Lankan")]
    [InlineData("Monthly Salary", "1200000")]
    [InlineData("Occupation", "Employed")]
    public async Task MapsTemplateLabelsToApplicantDetails(string label, string expected)
    {
        var repo = new TemplateRepo();
        repo.Fields.Add(new(label, "text", true));

        var result = await new PrefillApplicationTool(repo).PrefillAsync(1, Applicant());

        Assert.False(result.UsedDefaultTemplate);
        Assert.Equal(expected, result.FormFields[label]);
    }

    [Theory]
    [InlineData("Father's Name")]
    [InlineData("Mother's Name")]
    [InlineData("Business Name")]
    [InlineData("Company Name")]
    public async Task OtherPeoplesOrBusinessNames_AreNotFilledWithTheApplicantsName(string label)
    {
        var repo = new TemplateRepo();
        repo.Fields.Add(new(label, "text", true));

        var result = await new PrefillApplicationTool(repo).PrefillAsync(1, Applicant());

        Assert.DoesNotContain(label, result.FormFields.Keys);
        Assert.Contains(label, result.UnfilledRequiredFields);
    }

    [Fact]
    public async Task AdditionalAttributes_WinOverDerivedValues_AndMatchLabelsIgnoringCase()
    {
        var repo = new TemplateRepo();
        repo.Fields.Add(new("Full Name", "text", true));
        repo.Fields.Add(new("Vehicle Number", "text", true));
        var applicant = Applicant();
        applicant.AdditionalAttributes["full name"] = "N. Silva";
        applicant.AdditionalAttributes["Vehicle Number"] = " WP-CAB-1234 ";

        var result = await new PrefillApplicationTool(repo).PrefillAsync(1, applicant);

        Assert.Equal("N. Silva", result.FormFields["Full Name"]);
        Assert.Equal("WP-CAB-1234", result.FormFields["Vehicle Number"]);
    }

    [Fact]
    public async Task UnknownFields_SplitIntoRequiredAndOptional()
    {
        var repo = new TemplateRepo();
        repo.Fields.Add(new("Vehicle Number", "text", true, 1));
        repo.Fields.Add(new("Remarks", "text", false, 2));

        var result = await new PrefillApplicationTool(repo).PrefillAsync(1, Applicant());

        Assert.Equal(new[] { "Vehicle Number" }, result.UnfilledRequiredFields);
        Assert.Equal(new[] { "Remarks" }, result.UnfilledOptionalFields);
    }

    [Fact]
    public async Task ZeroAgeAndIncome_AreTreatedAsUnknown()
    {
        var applicant = Applicant();
        applicant.Age = 0;
        applicant.AnnualIncome = 0;

        var result = await new PrefillApplicationTool().PrefillAsync(1, applicant);

        Assert.Contains("Age", result.UnfilledRequiredFields);
        Assert.Contains("Annual Income", result.UnfilledOptionalFields);
    }
}

public class GetDocumentRequirementsToolTests
{
    private sealed class DocRepo : IDocumentRequirementRepository
    {
        public List<string> Names { get; } = new();
        public int? LastStage { get; private set; }

        public Task<List<string>> GetDocumentNamesAsync(int serviceProcedureId, int? stage = null, CancellationToken cancellationToken = default)
        {
            LastStage = stage;
            return Task.FromResult(Names);
        }
    }

    [Fact]
    public async Task TrimsDropsBlanksAndRemovesDuplicates()
    {
        var repo = new DocRepo();
        repo.Names.AddRange(new[] { " Birth Certificate ", "", "   ", "Birth Certificate", "NIC" });

        var docs = await new GetDocumentRequirementsTool(repo).GetRequiredDocumentsForServiceAsync(1, stage: 2);

        Assert.Equal(new[] { "Birth Certificate", "NIC" }, docs);
        Assert.Equal(2, repo.LastStage);
    }
}
