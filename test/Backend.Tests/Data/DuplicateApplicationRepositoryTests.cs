using Government_Service_Navigator.Backend.Models.Entities;
using Government_Service_Navigator.Backend.Services;
using Xunit;

namespace Government_Service_Navigator.Backend.Tests.Data;

public class DuplicateApplicationRepositoryTests
{
    private const string Nic = TestUsers.CitizenNic;

    private static async Task<(DuplicateApplicationRepository Repo, ApplicationSubmission Existing)> Seed(
        string stageStatus, string? taskStatus = null)
    {
        var db = TestDb.Create();
        var existing = new ApplicationSubmission { CitizenNic = Nic, ServiceProcedureId = 1, StageStatus = stageStatus };
        db.ApplicationSubmissions.Add(existing);
        await db.SaveChangesAsync();
        if (taskStatus != null)
        {
            db.VerificationTasks.Add(new VerificationTask { ApplicationId = existing.Id, Status = taskStatus, CreatedDate = DateTime.UtcNow });
            await db.SaveChangesAsync();
        }
        return (new DuplicateApplicationRepository(db), existing);
    }

    [Theory]
    [InlineData("StageApproved")]
    [InlineData("ActionRequired")]
    [InlineData("UnderVerification")]
    public async Task InProgressApplication_IsADuplicate(string stageStatus)
    {
        var (repo, _) = await Seed(stageStatus);

        Assert.True(await repo.HasDuplicateAsync(Nic, 1));
    }

    [Theory]
    [InlineData("Completed")]
    [InlineData("Rejected")]
    [InlineData("Deleted")]
    [InlineData("Draft")]
    [InlineData("AwaitingFeePayment")]
    public async Task FinishedOrUnsubmittedApplication_IsNotADuplicate(string stageStatus)
    {
        var (repo, _) = await Seed(stageStatus);

        Assert.False(await repo.HasDuplicateAsync(Nic, 1));
    }

    [Theory]
    [InlineData("Pending", true)]
    [InlineData("Revised", true)]
    [InlineData("Revision Requested", true)]
    [InlineData("Approved", false)]
    [InlineData("Rejected", false)]
    public async Task PendingReview_DependsOnTheVerificationTask(string taskStatus, bool duplicate)
    {
        var (repo, _) = await Seed("PendingReview", taskStatus);

        Assert.Equal(duplicate, await repo.HasDuplicateAsync(Nic, 1));
    }

    [Fact]
    public async Task PendingReview_WithNoTask_IsNotADuplicate()
    {
        var (repo, _) = await Seed("PendingReview");

        Assert.False(await repo.HasDuplicateAsync(Nic, 1));
    }

    [Fact]
    public async Task TheApplicationItself_IsExcluded()
    {
        var (repo, existing) = await Seed("StageApproved");

        Assert.False(await repo.HasDuplicateAsync(Nic, 1, excludeApplicationId: existing.Id));
    }

    [Fact]
    public async Task OtherServicesAndOtherCitizens_DoNotCount()
    {
        var (repo, _) = await Seed("StageApproved");

        Assert.False(await repo.HasDuplicateAsync(Nic, 2));
        Assert.False(await repo.HasDuplicateAsync("881234567V", 1));
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public async Task BlankNic_IsNeverADuplicate(string nic)
    {
        var (repo, _) = await Seed("StageApproved");

        Assert.False(await repo.HasDuplicateAsync(nic, 1));
    }

    [Fact]
    public async Task NicIsTrimmed()
    {
        var (repo, _) = await Seed("StageApproved");

        Assert.True(await repo.HasDuplicateAsync($"  {Nic} ", 1));
    }
}
