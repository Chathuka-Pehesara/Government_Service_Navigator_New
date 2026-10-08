using Government_Service_Navigator.Backend.Data.Context;
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

    // ---- Helpers for the queue and department tests ----

    private static VerificationTask NewTask(int applicationId, string status = "Pending", string? department = null, int minutesAgo = 0) => new()
    {
        ApplicationId = applicationId,
        Status = status,
        Department = department,
        CitizenNic = TestUsers.CitizenNic,
        CreatedDate = DateTime.UtcNow.AddMinutes(-minutesAgo)
    };

    private static async Task<ApplicationSubmission> AddSubmission(AppDbContext db, string? department, int currentStage = 1, int maxStages = 1)
    {
        var service = new ServiceProcedure { ServiceId = $"GSN-SRV-{db.ServiceProcedures.Count() + 1:D3}", Name = "Police Clearance", Category = "Legal & Security" };
        db.ServiceProcedures.Add(service);
        await db.SaveChangesAsync();
        var submission = new ApplicationSubmission
        {
            ServiceProcedureId = service.Id,
            CitizenNic = TestUsers.CitizenNic,
            CurrentDepartment = department,
            CurrentStage = currentStage,
            MaxStages = maxStages
        };
        db.ApplicationSubmissions.Add(submission);
        await db.SaveChangesAsync();
        return submission;
    }

    // ---- Create task ----

    [Fact]
    public async Task CreateTask_WritesATaskCreatedAuditRow()
    {
        var db = TestDb.Create();

        var task = await new VerificationService(db).CreateTaskAsync(new CreateTaskRequest { ApplicationId = 12 }, "Agent 4");

        var audit = await db.AuditLogs.SingleAsync();
        Assert.Equal("Task Created", audit.Action);
        Assert.Equal("Agent 4", audit.PerformedBy);
        Assert.Equal($"TaskId: {task.Id}, Status: Pending", audit.NewValues);
    }

    [Fact]
    public async Task CreateTask_WithoutAStageOrDepartment_UsesTheSubmissions()
    {
        var db = TestDb.Create();
        var submission = await AddSubmission(db, "Divisional Secretariat", currentStage: 2, maxStages: 3);

        var task = await new VerificationService(db).CreateTaskAsync(
            new CreateTaskRequest { ApplicationId = submission.Id, StageNumber = 0 }, "Citizen");

        Assert.Equal(2, task.StageNumber);
        Assert.Equal(3, task.MaxStages);
        Assert.Equal("Divisional Secretariat", task.Department);
    }

    // ---- Decisions ----

    [Fact]
    public async Task RecordDecision_KeepsTheChosenRejectionReason()
    {
        var db = TestDb.Create();
        var task = NewTask(12);
        db.VerificationTasks.Add(task);
        db.RejectionReasons.Add(new RejectionReason { Code = "ERR-101", Description = "Blurred NIC scan" });
        await db.SaveChangesAsync();
        var reason = await db.RejectionReasons.SingleAsync();

        await new VerificationService(db).RecordDecisionAsync(task.Id,
            new VerificationDecisionRequest { Status = "Rejected", RejectionReasonId = reason.Id }, "officer@gov.lk");

        Assert.Equal(reason.Id, (await db.OfficerReviews.SingleAsync()).RejectionReasonId);
    }

    /// <summary>Known gap: an unknown task id reports success (a leftover mock fallback) and writes nothing.</summary>
    [Fact]
    public async Task RecordDecision_UnknownTask_ReportsSuccess_ButWritesNothing()
    {
        var db = TestDb.Create();

        Assert.True(await new VerificationService(db).RecordDecisionAsync(404, new VerificationDecisionRequest { Status = "Approved" }, "officer"));

        Assert.Empty(await db.OfficerReviews.ToListAsync());
        Assert.Empty(await db.AuditLogs.ToListAsync());
    }

    [Fact]
    public async Task BulkVerify_DecidesEveryListedTask_WithAReviewAndAuditEach()
    {
        var db = TestDb.Create();
        db.VerificationTasks.AddRange(NewTask(1), NewTask(2), NewTask(3));
        await db.SaveChangesAsync();
        var ids = await db.VerificationTasks.Where(t => t.ApplicationId != 3).Select(t => t.Id).ToListAsync();

        var ok = await new VerificationService(db).BulkVerifyAsync(new BulkVerifyRequest { TaskIds = ids, Status = "Approved", Comments = "Batch" }, "officer");

        Assert.True(ok);
        Assert.Equal(new[] { "Approved", "Approved", "Pending" }, await db.VerificationTasks.OrderBy(t => t.ApplicationId).Select(t => t.Status).ToListAsync());
        Assert.Equal(2, await db.OfficerReviews.CountAsync());
        Assert.All(await db.AuditLogs.ToListAsync(), a => Assert.Equal("Bulk Decision: Approved", a.Action));
    }

    [Fact]
    public async Task BulkVerify_NoTaskIds_Fails() =>
        Assert.False(await new VerificationService(TestDb.Create()).BulkVerifyAsync(new BulkVerifyRequest { Status = "Approved" }, "officer"));

    // ---- Delete ----

    [Fact]
    public async Task DeleteTask_AuditsTheReason_RemovesReviewsAndChecks_AndMarksTheApplicationDeleted()
    {
        var db = TestDb.Create();
        var submission = await AddSubmission(db, "Police Department");
        var task = NewTask(submission.Id, department: "Police Department");
        db.VerificationTasks.Add(task);
        await db.SaveChangesAsync();
        db.OfficerReviews.Add(new OfficerReview { TaskId = task.Id, OfficerId = "officer", Comments = "Seen", ReviewDate = DateTime.UtcNow });
        db.ComplianceChecks.Add(new ComplianceCheck { TaskId = task.Id, CheckType = "NIC", IsPassed = true, Details = "ok" });
        await db.SaveChangesAsync();

        Assert.True(await new VerificationService(db).DeleteTaskAsync(task.Id, "officer@gov.lk", "  Duplicate request  "));

        Assert.Empty(await db.VerificationTasks.ToListAsync());
        Assert.Empty(await db.OfficerReviews.ToListAsync());
        Assert.Empty(await db.ComplianceChecks.ToListAsync());
        Assert.Equal("Deleted", (await db.ApplicationSubmissions.SingleAsync()).StageStatus);
        var audit = await db.AuditLogs.SingleAsync();
        Assert.Equal("Application Deleted", audit.Action);
        Assert.EndsWith("Reason: Duplicate request", audit.NewValues);
        Assert.Contains("Service: Police Clearance", audit.OldValues);
    }

    [Fact]
    public async Task DeleteTask_WithoutAReason_UsesTheDefault_AndUnknownTaskIsFalse()
    {
        var db = TestDb.Create();
        var task = NewTask(12);
        db.VerificationTasks.Add(task);
        await db.SaveChangesAsync();
        var service = new VerificationService(db);

        Assert.False(await service.DeleteTaskAsync(404, "officer"));
        Assert.True(await service.DeleteTaskAsync(task.Id, "officer"));

        Assert.Contains("dismissed by officer", (await db.AuditLogs.SingleAsync()).NewValues);
    }

    // ---- Department-based access ----

    [Fact]
    public async Task PendingQueue_IsLimitedToTheOfficersDepartment()
    {
        var db = TestDb.Create();
        var routed = await AddSubmission(db, "Police Department");
        db.VerificationTasks.AddRange(
            NewTask(101, department: "Police Department"),
            NewTask(102, department: "police department"),
            NewTask(routed.Id),                                  // no department on the task, but the application is with Police
            NewTask(103, department: "Divisional Secretariat"),
            NewTask(104));                                       // no department anywhere
        await db.SaveChangesAsync();
        var service = new VerificationService(db);

        var police = await service.GetPendingTasksAsync("Police Department", null, 25);
        var everyone = await service.GetPendingTasksAsync(null, null, 25);

        Assert.Equal(new[] { 101, 102, routed.Id }.OrderBy(i => i), police.Items.Select(t => t.ApplicationId).OrderBy(i => i));
        Assert.Equal(5, everyone.Total);
    }

    [Fact]
    public async Task PendingQueue_LeavesOutDecidedTasks_AndTasksWithoutAnApplication()
    {
        var db = TestDb.Create();
        db.VerificationTasks.AddRange(NewTask(1), NewTask(2, "Revised"), NewTask(3, "Revision Requested"), NewTask(4, "Approved"), NewTask(0));
        await db.SaveChangesAsync();

        var pending = await new VerificationService(db).GetPendingTasksAsync(null, null, 25);

        Assert.Equal(new[] { 1, 2, 3 }, pending.Items.Select(t => t.ApplicationId).OrderBy(i => i));
    }

    [Fact]
    public async Task VerifiedQueue_IncludesTasksAnOfficerOfTheDepartmentReviewed()
    {
        var db = TestDb.Create();
        var reviewed = NewTask(201, "Approved", department: "Divisional Secretariat");
        db.VerificationTasks.AddRange(reviewed, NewTask(202, "Rejected", department: "Police Department"), NewTask(203, "Approved", department: "Registrar"));
        await db.SaveChangesAsync();
        db.OfficerReviews.Add(new OfficerReview { TaskId = reviewed.Id, OfficerId = "officer@gov.lk (Police Department)", Comments = "Stage 1", ReviewDate = DateTime.UtcNow });
        await db.SaveChangesAsync();

        var verified = await new VerificationService(db).GetVerifiedTasksAsync("Police Department", null, 25);

        Assert.Equal(new[] { 201, 202 }, verified.Items.Select(t => t.ApplicationId).OrderBy(i => i));
    }

    [Fact]
    public async Task VerifiedQueue_RejectedFilter_AlsoShowsSuspended()
    {
        var db = TestDb.Create();
        db.VerificationTasks.AddRange(NewTask(1, "Rejected"), NewTask(2, "Suspended"), NewTask(3, "Approved"));
        await db.SaveChangesAsync();
        var service = new VerificationService(db);

        var rejected = await service.GetVerifiedTasksAsync(null, null, 25, status: "Rejected");
        var approved = await service.GetVerifiedTasksAsync(null, null, 25, status: "Approved");

        Assert.Equal(new[] { 1, 2 }, rejected.Items.Select(t => t.ApplicationId).OrderBy(i => i));
        Assert.Equal(3, Assert.Single(approved.Items).ApplicationId);
    }

    [Fact]
    public async Task Queue_Pages_NewestFirst()
    {
        var db = TestDb.Create();
        for (var i = 1; i <= 5; i++) db.VerificationTasks.Add(NewTask(i, minutesAgo: i));
        await db.SaveChangesAsync();

        var page2 = await new VerificationService(db).GetPendingTasksAsync(null, page: 2, pageSize: 2);

        Assert.Equal(5, page2.Total);
        Assert.Equal(2, page2.Page);
        Assert.Equal(new[] { 3, 4 }, page2.Items.Select(t => t.ApplicationId));
    }

    [Fact]
    public async Task TaskSummary_CountsOnlyTheDepartmentsTasks()
    {
        var db = TestDb.Create();
        db.VerificationTasks.AddRange(
            NewTask(1, "Pending", "Police Department"),
            NewTask(2, "Approved", "Police Department"),
            NewTask(3, "Rejected", "Police Department"),
            NewTask(4, "Suspended", "Police Department"),
            NewTask(5, "Approved", "Registrar"));
        await db.SaveChangesAsync();

        var summary = await new VerificationService(db).GetTaskSummaryAsync("Police Department");

        Assert.Equal(1, summary.Pending);
        Assert.Equal(1, summary.Approved);
        Assert.Equal(1, summary.Rejected);
        Assert.Equal(1, summary.Suspended);
        Assert.Equal(3, summary.Verified);
    }

    // ---- Officer stats, audit trail and rejection reasons ----

    [Fact]
    public async Task OfficerStats_CountTodaysReviews_AndTheApprovalRate()
    {
        var db = TestDb.Create();
        var approved = NewTask(1, "Approved");
        var rejected = NewTask(2, "Rejected");
        db.VerificationTasks.AddRange(approved, rejected);
        await db.SaveChangesAsync();
        db.OfficerReviews.AddRange(
            new OfficerReview { TaskId = approved.Id, OfficerId = "me", Comments = "", ReviewDate = DateTime.UtcNow },
            new OfficerReview { TaskId = rejected.Id, OfficerId = "me", Comments = "", ReviewDate = DateTime.UtcNow },
            new OfficerReview { TaskId = approved.Id, OfficerId = "someone else", Comments = "", ReviewDate = DateTime.UtcNow });
        await db.SaveChangesAsync();

        var stats = await new VerificationService(db).GetOfficerStatsAsync("me");

        Assert.Equal(2, stats.ReviewedToday);
        Assert.Equal(50, stats.ApprovalRate);
    }

    [Fact]
    public async Task OfficerStats_NoDecisionsYet_HasNoApprovalRate() =>
        Assert.Null((await new VerificationService(TestDb.Create()).GetOfficerStatsAsync("me")).ApprovalRate);

    [Fact]
    public async Task AuditLogs_ForOneApplication_NewestFirst()
    {
        var db = TestDb.Create();
        db.AuditLogs.AddRange(
            new AuditLog { ApplicationId = 7, Action = "Task Created", PerformedBy = "a", OldValues = "", NewValues = "", Timestamp = DateTime.UtcNow.AddHours(-1) },
            new AuditLog { ApplicationId = 7, Action = "Decision: Approved", PerformedBy = "b", OldValues = "", NewValues = "", Timestamp = DateTime.UtcNow },
            new AuditLog { ApplicationId = 8, Action = "Task Created", PerformedBy = "c", OldValues = "", NewValues = "", Timestamp = DateTime.UtcNow });
        await db.SaveChangesAsync();

        var logs = await new VerificationService(db).GetAuditLogsAsync(7);

        Assert.Equal(new[] { "Decision: Approved", "Task Created" }, logs.Select(l => l.Action));
    }

    [Fact]
    public async Task RejectionReasons_CreateListUpdateDelete()
    {
        var db = TestDb.Create();
        var service = new VerificationService(db);

        var b = await service.CreateRejectionReasonAsync(new RejectionReason { Code = "ERR-200", Description = "Expired document" });
        await service.CreateRejectionReasonAsync(new RejectionReason { Code = "ERR-100", Description = "Blurred scan" });
        Assert.Equal(new[] { "ERR-100", "ERR-200" }, (await service.GetRejectionReasonsAsync()).Select(r => r.Code));

        Assert.True(await service.UpdateRejectionReasonAsync(b.Id, new RejectionReason { Code = "ERR-201", Description = "Document has expired" }));
        Assert.Equal("Document has expired", (await db.RejectionReasons.FindAsync(b.Id))!.Description);
        Assert.False(await service.UpdateRejectionReasonAsync(404, new RejectionReason { Code = "X", Description = "Y" }));

        Assert.True(await service.DeleteRejectionReasonAsync(b.Id));
        Assert.False(await service.DeleteRejectionReasonAsync(b.Id));
        Assert.Single(await db.RejectionReasons.ToListAsync());
    }
}
