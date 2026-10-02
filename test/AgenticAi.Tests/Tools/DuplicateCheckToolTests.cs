using Government_Service_Navigator.AgenticAi.Tools.CheckDuplicateApplication;
using Xunit;

namespace Government_Service_Navigator.AgenticAi.Tests.Tools;

public class DuplicateCheckToolTests
{
    private const string Nic = "200012345678";

    public DuplicateCheckToolTests() => DuplicateCheckTool.ClearRegistry();

    [Fact]
    public async Task NothingRegistered_NoRepository_IsNotDuplicate()
    {
        var outcome = await new DuplicateCheckTool().CheckAsync(Nic, 1);

        Assert.False(outcome.IsDuplicate);
        Assert.True(outcome.ComplianceCheck.IsPassed);
    }

    [Fact]
    public async Task RegisteredApplication_BlocksANewOneForTheSameService()
    {
        var tool = new DuplicateCheckTool();
        tool.RegisterApplication(Nic, 1, "APP-2026-10");

        var outcome = await tool.CheckAsync(Nic, 1);

        Assert.True(outcome.IsDuplicate);
        Assert.Equal("APP-2026-10", outcome.ExistingReference);
        Assert.StartsWith("DUP-001", outcome.Message);
        Assert.False(outcome.ComplianceCheck.IsPassed);
    }

    [Fact]
    public async Task RegisteredApplication_DoesNotBlockAnotherService()
    {
        var tool = new DuplicateCheckTool();
        tool.RegisterApplication(Nic, 1, "APP-2026-10");

        var outcome = await tool.CheckAsync(Nic, 2);

        Assert.False(outcome.IsDuplicate);
    }

    [Fact]
    public async Task RegistryKey_IgnoresCaseAndSurroundingSpaces()
    {
        var tool = new DuplicateCheckTool();
        tool.RegisterApplication("881234567v", 1, "APP-2026-10");

        var outcome = await tool.CheckAsync(" 881234567V ", 1);

        Assert.True(outcome.IsDuplicate);
    }

    [Theory]
    [InlineData("APP-2026-10")]
    [InlineData("APP-10")]
    public async Task SameApplication_IsNotItsOwnDuplicate(string reference)
    {
        var tool = new DuplicateCheckTool();
        tool.RegisterApplication(Nic, 1, reference);

        var outcome = await tool.CheckAsync(Nic, 1, currentApplicationId: 10);

        Assert.False(outcome.IsDuplicate);
    }

    [Fact]
    public async Task StaleRegistryEntry_IsClearedWhenTheDatabaseShowsNoConflict()
    {
        var repo = new FakeDuplicateRepository();
        var tool = new DuplicateCheckTool(repo);
        tool.RegisterApplication(Nic, 1, "APP-2026-10");

        var first = await tool.CheckAsync(Nic, 1);
        var second = await new DuplicateCheckTool().CheckAsync(Nic, 1);

        Assert.False(first.IsDuplicate);
        // The entry was removed, so even a tool without a database no longer sees it
        Assert.False(second.IsDuplicate);
    }

    [Fact]
    public async Task RegistryEntry_IsRepointedToTheCurrentApplication_WhenTheDatabaseAgrees()
    {
        var tool = new DuplicateCheckTool(new FakeDuplicateRepository());
        tool.RegisterApplication(Nic, 1, "APP-2026-10");

        await tool.CheckAsync(Nic, 1, currentApplicationId: 11);
        var otherApp = await new DuplicateCheckTool().CheckAsync(Nic, 1, currentApplicationId: 12);

        Assert.True(otherApp.IsDuplicate);
        Assert.Equal("APP-2026-11", otherApp.ExistingReference);
    }

    [Fact]
    public async Task DatabaseMatch_IsADuplicate()
    {
        var repo = new FakeDuplicateRepository();
        repo.Active.Add((Nic, 1));

        var outcome = await new DuplicateCheckTool(repo).CheckAsync(Nic, 1);

        Assert.True(outcome.IsDuplicate);
        Assert.Equal("DB-MATCH", outcome.ExistingReference);
        Assert.StartsWith("DUP-002", outcome.Message);
    }

    [Fact]
    public async Task RegistryAndDatabaseBothAgree_ReportsTheRegistryReference()
    {
        var repo = new FakeDuplicateRepository();
        repo.Active.Add((Nic, 1));
        var tool = new DuplicateCheckTool(repo);
        tool.RegisterApplication(Nic, 1, "APP-2026-10");

        var outcome = await tool.CheckAsync(Nic, 1);

        Assert.True(outcome.IsDuplicate);
        Assert.StartsWith("DUP-001", outcome.Message);
    }
}
