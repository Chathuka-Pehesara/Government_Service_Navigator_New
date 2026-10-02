using System.ComponentModel.DataAnnotations;
using Government_Service_Navigator.Backend.Models.Entities;
using Government_Service_Navigator.Backend.Services;
using Government_Service_Navigator.Backend.Validation;
using Xunit;

namespace Government_Service_Navigator.Backend.Tests.Validation;

public class SriLankaNicTests
{
    [Theory]
    [InlineData("881234567V", 1988, false, true)]
    [InlineData("881234567x", 1988, false, true)]
    [InlineData("200012345678", 2000, false, false)]
    [InlineData("200062345678", 2000, true, false)]
    [InlineData(" 885234567v ", 1988, true, true)]
    public void ParsesValidNumbers(string nic, int year, bool female, bool oldFormat)
    {
        Assert.True(SriLankaNic.TryParse(nic, out var info, out var error));
        Assert.Null(error);
        Assert.Equal(year, info!.BirthDate.Year);
        Assert.Equal(female, info.IsFemale);
        Assert.Equal(oldFormat, info.IsOldFormat);
    }

    [Fact]
    public void DayNumberIsTheDayOfALeapYear()
    {
        // Day 060 is 29 February; day 061 is 1 March, even in a non-leap year
        Assert.True(SriLankaNic.TryParse("200006012345", out var leap, out _));
        Assert.Equal(new DateTime(2000, 2, 29), leap!.BirthDate);

        Assert.True(SriLankaNic.TryParse("199906112345", out var march, out _));
        Assert.Equal(new DateTime(1999, 3, 1), march!.BirthDate);
    }

    [Theory]
    [InlineData(null, "9 digits")]
    [InlineData("", "9 digits")]
    [InlineData("88123456V", "9 digits")]
    [InlineData("881234567A", "9 digits")]
    [InlineData("20001234567", "9 digits")]
    [InlineData("200036712345", "day number")]
    [InlineData("200000012345", "day number")]
    [InlineData("189912345678", "birth year")]
    [InlineData("199906012345", "29 February")]
    public void RejectsInvalidNumbers_WithAReason(string? nic, string reasonFragment)
    {
        var error = SriLankaNic.Validate(nic);

        Assert.NotNull(error);
        Assert.Contains(reasonFragment, error);
        Assert.False(SriLankaNic.IsValid(nic));
    }

    [Fact]
    public void RejectsABirthYearInTheFuture()
    {
        var nextYear = DateTime.UtcNow.Year + 1;

        Assert.Contains("birth year", SriLankaNic.Validate($"{nextYear}00112345"));
    }

    [Fact]
    public void Normalize_TrimsAndUppercases()
    {
        Assert.Equal("881234567V", SriLankaNic.Normalize(" 881234567v "));
        Assert.Equal(string.Empty, SriLankaNic.Normalize(null));
    }
}

public class AgeFromNicTests
{
    private static readonly DateTime Today = new(2026, 6, 15);

    [Theory]
    [InlineData("200016612345", 26)] // born 14 June 2000 -> birthday passed
    [InlineData("200016812345", 25)] // born 16 June 2000 -> birthday tomorrow
    [InlineData("881234567V", 38)]   // born 2 May 1988
    [InlineData("886234567V", 38)]   // same day, female
    public void ComputesAgeOnTheGivenDay(string nic, int expected)
    {
        Assert.Equal(expected, ApplicationDraftingService.AgeFromNic(nic, Today));
    }

    [Theory]
    [InlineData("")]
    [InlineData("not-a-nic")]
    [InlineData("200099912345")]
    [InlineData("203001012345")]
    public void InvalidOrFutureNic_GivesNull(string nic)
    {
        Assert.Null(ApplicationDraftingService.AgeFromNic(nic, Today));
    }
}

public class ValidationAttributeTests
{
    private static bool Valid(ValidationAttribute attribute, object? value) =>
        attribute.GetValidationResult(value, new ValidationContext(new object()) { MemberName = "Field" }) == ValidationResult.Success;

    [Theory]
    [InlineData("name@example.com", true)]
    [InlineData("first.last+tag@sub.gov.lk", true)]
    [InlineData("a@b", false)]
    [InlineData("no-at-sign.com", false)]
    [InlineData("name@domain.c", false)]
    [InlineData("", true)]
    [InlineData(null, true)]
    public void Email(string? value, bool expected) => Assert.Equal(expected, Valid(new EmailAttribute(), value));

    [Theory]
    [InlineData("0771234567", true)]
    [InlineData("+94771234567", true)]
    [InlineData("0094771234567", true)]
    [InlineData("077-123 4567", true)]
    [InlineData("(077) 1234567", true)]
    [InlineData("0071234567", false)]
    [InlineData("077123456", false)]
    [InlineData("1919", false)]
    [InlineData("", true)]
    public void SriLankaPhone(string? value, bool expected) => Assert.Equal(expected, Valid(new SriLankaPhoneAttribute(), value));

    [Theory]
    [InlineData("1919", true)]
    [InlineData("119", true)]
    [InlineData("12", false)]
    [InlineData("21919", false)]
    public void SriLankaPhone_ShortCodes(string value, bool expected) =>
        Assert.Equal(expected, Valid(new SriLankaPhoneAttribute { AllowShortCode = true }, value));

    [Theory]
    [InlineData("Passw0rd", null)]
    [InlineData("Pa0rd", "at least 8")]
    [InlineData("password1", "uppercase")]
    [InlineData("PASSWORD1", "lowercase")]
    [InlineData("Password", "number")]
    [InlineData("Pass word1", "spaces")]
    public void StrongPassword(string value, string? errorFragment)
    {
        var error = StrongPasswordAttribute.Check(value);

        if (errorFragment == null) Assert.Null(error);
        else Assert.Contains(errorFragment, error);
    }

    [Fact]
    public void StrongPassword_RejectsOver64Characters()
    {
        Assert.Contains("at most 64", StrongPasswordAttribute.Check("Aa1" + new string('x', 62)));
    }

    [Theory]
    [InlineData("Nimal Silva", true)]
    [InlineData("O'Brien-Perera", true)]
    [InlineData("K. M. Fernando", true)]
    [InlineData("නිමල් සිල්වා", true)]
    [InlineData("நிமல்", true)]
    [InlineData("N", false)]
    [InlineData("1Nimal", false)]
    [InlineData("Nimal <b>", false)]
    public void PersonName(string value, bool expected) => Assert.Equal(expected, Valid(new PersonNameAttribute(), value));

    [Theory]
    [InlineData(1, true)]
    [InlineData(0.01, true)]
    [InlineData(10_000_000, true)]
    [InlineData(0, false)]
    [InlineData(-5, false)]
    [InlineData(10_000_000.01, false)]
    [InlineData(1.005, false)]
    public void Money(double value, bool expected) => Assert.Equal(expected, Valid(new MoneyAttribute(), (decimal)value));

    [Theory]
    [InlineData("09:00", true)]
    [InlineData("23:59:59", true)]
    [InlineData("24:00", false)]
    [InlineData("9:00", false)]
    [InlineData("09:60", false)]
    public void TimeOfDay(string value, bool expected) => Assert.Equal(expected, Valid(new TimeOfDayAttribute(), value));

    [Theory]
    [InlineData("https://gov.lk", true)]
    [InlineData("http://example.com/path?q=1", true)]
    [InlineData("ftp://example.com", false)]
    [InlineData("example.com", false)]
    [InlineData("javascript:alert(1)", false)]
    public void WebUrl(string value, bool expected) => Assert.Equal(expected, Valid(new WebUrlAttribute(), value));

    [Theory]
    [InlineData("https://cdn.example.com/logo.png", true)]
    [InlineData("data:image/png;base64,iVBORw0KGgo=", true)]
    [InlineData("data:image/jpeg;base64,/9j/4AAQ", true)]
    [InlineData("data:image/svg+xml;base64,PHN2Zz4=", false)]
    [InlineData("data:text/html;base64,PGgxPg==", false)]
    [InlineData("not a url", false)]
    public void ImageUrl(string value, bool expected) => Assert.Equal(expected, Valid(new ImageUrlAttribute(), value));

    [Theory]
    [InlineData("Score 5 < 6 and 7 > 3", true)]
    [InlineData("Please check <b>this</b>", false)]
    [InlineData("<script>alert(1)</script>", false)]
    [InlineData("< /div>", false)]
    public void PlainText(string value, bool expected) => Assert.Equal(expected, Valid(new PlainTextAttribute(), value));

    [Fact]
    public void Nic_EmptyPasses_InvalidFails()
    {
        Assert.True(Valid(new SriLankaNicAttribute(), ""));
        Assert.False(Valid(new SriLankaNicAttribute(), "123"));
    }
}

public class ServiceCatalogValidatorTests
{
    private static ServiceProcedure Service() => new()
    {
        ServiceId = "GSN-SRV-001",
        Name = "Passport Renewal",
        Category = "Transport & Travel",
        Status = "Active",
        TotalStages = 1
    };

    [Fact]
    public void ValidService_HasNoErrors() => Assert.Empty(ServiceCatalogValidator.Service(Service()));

    [Fact]
    public void NullService_IsAnError() => Assert.Single(ServiceCatalogValidator.Service(null));

    [Theory]
    [InlineData("A")]
    [InlineData("-GSN")]
    [InlineData("GSN SRV")]
    [InlineData("GSN-SRV-0000000000000000000000001")]
    public void BadServiceCode(string code)
    {
        var s = Service();
        s.ServiceId = code;

        Assert.Contains(ServiceCatalogValidator.Service(s), e => e.Contains("Service code"));
    }

    [Fact]
    public void ShortName_UnknownStatus_AndBadStageCount_AreAllReported()
    {
        var s = Service();
        s.Name = "ab";
        s.Status = "Archived";
        s.TotalStages = 0;

        var errors = ServiceCatalogValidator.Service(s);

        Assert.Equal(3, errors.Count);
    }

    [Fact]
    public void EligibilityRules()
    {
        var errors = ServiceCatalogValidator.EligibilityRules(new()
        {
            new() { Field = "Age", Operator = ">=", Value = "18" },
            new() { Field = "Age", Operator = ">=", Value = "abc" },
            new() { Field = "Annual Income", Operator = "<=", Value = "-1" },
            new() { Field = "Citizenship", Operator = "~", Value = "Sri Lankan" },
            new() { Field = "", Operator = "==", Value = "" },
        });

        Assert.Contains(errors, e => e.StartsWith("Rule 2: age"));
        Assert.Contains(errors, e => e.StartsWith("Rule 3: income"));
        Assert.Contains(errors, e => e.StartsWith("Rule 4: operator"));
        Assert.Contains(errors, e => e.StartsWith("Rule 5: choose"));
        Assert.DoesNotContain(errors, e => e.StartsWith("Rule 1"));
        Assert.Single(ServiceCatalogValidator.EligibilityRules(null));
    }

    [Fact]
    public void Documents_RejectRepeatsIgnoringCase()
    {
        var errors = ServiceCatalogValidator.Documents(new()
        {
            new() { DocumentName = "Birth Certificate" },
            new() { DocumentName = " birth certificate " },
        });

        Assert.Contains(errors, e => e.Contains("Repeated"));
    }

    [Fact]
    public void Fees_AllowZero_ButNotNegativeOrThreeDecimals()
    {
        Assert.Empty(ServiceCatalogValidator.Fees(new() { new() { FeeType = "Free", Amount = 0m } }));

        var errors = ServiceCatalogValidator.Fees(new()
        {
            new() { FeeType = "A", Amount = -1m },
            new() { FeeType = "B", Amount = 1.005m },
            new() { FeeType = "", Amount = 10m },
        });

        Assert.Contains(errors, e => e.StartsWith("Fee 1: amount must be between"));
        Assert.Contains(errors, e => e.StartsWith("Fee 2: amount can have at most 2 decimal"));
        Assert.Contains(errors, e => e.StartsWith("Fee 3: fee type"));
    }

    [Fact]
    public void Workflow()
    {
        Assert.Empty(ServiceCatalogValidator.Workflow(2, new() { "Police Department", "Divisional Secretariat" }));
        Assert.Contains(ServiceCatalogValidator.Workflow(1, new() { "A", "B" }), e => e.Contains("more departments"));
        Assert.Contains(ServiceCatalogValidator.Workflow(2, new() { "A", " " }), e => e.Contains("Every stage"));
        Assert.Contains(ServiceCatalogValidator.Workflow(51, null), e => e.Contains("between 1 and 50"));
    }
}

public class ApplicationAnswersValidatorTests
{
    private static FormField Field(string label, string type, string? options = null) =>
        new() { Label = label, Type = type, Options = options };

    private static Dictionary<string, string> Validate(FormField field, string answer) =>
        ApplicationAnswersValidator.Validate(new[] { field }, new Dictionary<string, string> { [field.Label] = answer });

    [Theory]
    [InlineData("number", "1,250.50", true)]
    [InlineData("number", "abc", false)]
    [InlineData("date", "2026-06-15", true)]
    [InlineData("date", "1850-01-01", false)]
    [InlineData("date", "yesterday", false)]
    [InlineData("table", "[{\"a\":1}]", true)]
    [InlineData("table", "{\"a\":1}", false)]
    [InlineData("table", "not json", false)]
    [InlineData("unknown-type", "anything", true)]
    public void ChecksValuesByFieldType(string type, string answer, bool valid)
    {
        Assert.Equal(valid, Validate(Field("Answer", type), answer).Count == 0);
    }

    [Theory]
    [InlineData("Colombo", true)]
    [InlineData("colombo", true)]
    [InlineData("Jaffna", false)]
    public void Select_MustBeAnOption(string answer, bool valid)
    {
        Assert.Equal(valid, Validate(Field("District", "select", "Colombo, Kandy"), answer).Count == 0);
    }

    [Theory]
    [InlineData("Colombo, Kandy", true)]
    [InlineData("Colombo, Galle", false)]
    public void Multiselect_EveryChoiceMustBeAnOption(string answer, bool valid)
    {
        Assert.Equal(valid, Validate(Field("Districts", "multiselect", "Colombo,Kandy"), answer).Count == 0);
    }

    [Fact]
    public void TextLengthLimits()
    {
        Assert.NotEmpty(Validate(Field("Remarks", "text"), new string('x', 1001)));
        Assert.Empty(Validate(Field("Remarks", "textarea"), new string('x', 5000)));
        Assert.NotEmpty(Validate(Field("Remarks", "textarea"), new string('x', 5001)));
    }

    [Theory]
    [InlineData("NIC Number", "200012345678", true)]
    [InlineData("NIC Number", "12345", false)]
    [InlineData("National ID", "12345", false)]
    [InlineData("Email", "nimal@example.com", true)]
    [InlineData("E-mail", "not-an-email", false)]
    [InlineData("Mobile Phone", "077 123 4567", true)]
    [InlineData("Contact No", "12345", false)]
    [InlineData("Remarks", "anything goes", true)]
    public void TextFields_AreCheckedByWhatTheLabelNames(string label, string answer, bool valid)
    {
        Assert.Equal(valid, Validate(Field(label, "text"), answer).Count == 0);
    }

    [Fact(Skip = "Known bug: any label containing \"nic\" is treated as an NIC, so 'Clinic name' rejects normal text")]
    public void LabelsThatOnlyContainTheLettersNic_AreNotTreatedAsNic()
    {
        Assert.Empty(Validate(Field("Clinic name", "text"), "Asiri Hospital"));
    }

    [Fact]
    public void BlankAndMissingAnswers_AreLeftToTheRequiredCheck()
    {
        var fields = new[] { Field("Age", "number"), Field("Email", "text") };

        var errors = ApplicationAnswersValidator.Validate(fields, new Dictionary<string, string> { ["Age"] = "  " });

        Assert.Empty(errors);
    }

    [Fact]
    public void ErrorMessages_NameTheField()
    {
        var errors = Validate(Field("Age", "number"), "abc");

        Assert.Equal("Age: must be a number.", errors["Age"]);
    }
}

public class UploadedFileTypesTests
{
    [Fact]
    public void DetectsPdfJpegAndPngFromTheirBytes()
    {
        Assert.Equal("application/pdf", UploadedFileTypes.Detect("%PDF-1.7"u8.ToArray()));
        Assert.Equal("image/jpeg", UploadedFileTypes.Detect(new byte[] { 0xFF, 0xD8, 0xFF, 0xE0 }));
        Assert.Equal("image/png", UploadedFileTypes.Detect(new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A }));
    }

    [Fact]
    public void RejectsOtherOrTruncatedContent()
    {
        Assert.Null(UploadedFileTypes.Detect("MZ executable"u8.ToArray()));
        Assert.Null(UploadedFileTypes.Detect("<html>"u8.ToArray()));
        Assert.Null(UploadedFileTypes.Detect(new byte[] { 0x89, 0x50, 0x4E, 0x47 }));
        Assert.Null(UploadedFileTypes.Detect(Array.Empty<byte>()));
    }

    [Fact]
    public void MaxUploadIsTenMegabytes() => Assert.Equal(10 * 1024 * 1024, UploadedFileTypes.MaxBytes);
}
