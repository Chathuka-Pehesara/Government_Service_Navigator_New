using Government_Service_Navigator.Backend.DTOs.Requests;
using Government_Service_Navigator.Backend.Models.Entities;
using Government_Service_Navigator.Backend.Services;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace Government_Service_Navigator.Backend.Tests.Services;

public class VerificationServiceTests
{
    [Fact]
    public async Task CreateTask_StartsPendingInTheGivenDepartmentAndStage()
    {
        var db = TestDb.Create();

        var task = await new VerificationService(db).CreateTaskAsync(new CreateTaskRequest
        {
            ApplicationId = 12,
            CitizenNic = TestUsers.CitizenNic,
            Department = "Police Department",
            StageNumber = 2
        }, "Citizen");

        var stored = await db.VerificationTasks.SingleAsync();
        Assert.Equal(task.Id, stored.Id);
        Assert.Equal(12, stored.ApplicationId);
        Assert.Equal("Pending", stored.Status);
        Assert.Equal("Police Department", stored.Department);
        Assert.Equal(2, stored.StageNumber);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-3)]
    public async Task CreateTask_RefusesAnInvalidApplicationId(int applicationId)
    {
        var db = TestDb.Create();

        await Assert.ThrowsAsync<ArgumentException>(() =>
            new VerificationService(db).CreateTaskAsync(new CreateTaskRequest { ApplicationId = applicationId }, "Citizen"));
        Assert.Empty(await db.VerificationTasks.ToListAsync());
    }

    [Fact]
    public async Task CreateTask_ReusesTheApplicationsExistingTask()
    {
        var db = TestDb.Create();
        var service = new VerificationService(db);
        var request = new CreateTaskRequest { ApplicationId = 12, CitizenNic = TestUsers.CitizenNic };

        var first = await service.CreateTaskAsync(request, "Citizen");
        var second = await service.CreateTaskAsync(request, "Citizen");

        Assert.Equal(first.Id, second.Id);
        Assert.Single(await db.VerificationTasks.ToListAsync());
    }

    [Theory]
    [InlineData("Approved")]
    [InlineData("Rejected")]
    [InlineData("Revised")]
    public async Task RecordDecision_SetsTheStatus_AndWritesAReviewAndAnAuditRow(string status)
    {
        var db = TestDb.Create();
        var task = new VerificationTask { ApplicationId = 12, Status = "Pending", CreatedDate = DateTime.UtcNow };
        db.VerificationTasks.Add(task);
        await db.SaveChangesAsync();

        var ok = await new VerificationService(db).RecordDecisionAsync(task.Id,
            new VerificationDecisionRequest { Status = status, Comments = "Checked" }, "officer@gov.lk (Police Department)");

        Assert.True(ok);
        Assert.Equal(status, (await db.VerificationTasks.SingleAsync()).Status);
        var review = await db.OfficerReviews.SingleAsync();
        Assert.Equal("Checked", review.Comments);
        Assert.Equal("officer@gov.lk (Police Department)", review.OfficerId);
        var audit = await db.AuditLogs.SingleAsync();
        Assert.Equal($"Decision: {status}", audit.Action);
        Assert.Equal(12, audit.ApplicationId);
        Assert.Contains("Pending", audit.OldValues);
    }
}
