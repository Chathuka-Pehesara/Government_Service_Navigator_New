using System.Security.Claims;
using Government_Service_Navigator.Backend.Controllers;
using Government_Service_Navigator.Backend.Data.Context;
using Government_Service_Navigator.Backend.DTOs.Requests;
using Government_Service_Navigator.Backend.Models.Entities;
using Government_Service_Navigator.Backend.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Government_Service_Navigator.Backend.Tests.Controllers;

/// <summary>
/// The officer endpoints: department-based access to tasks, the payment approval lock (a stage
/// with a fee cannot be approved until Finance has cleared the payment), and how decisions move
/// the citizen's application along.
/// </summary>
public class VerificationControllerTests
{
    private const string Police = "Police Department";
    private const string Secretariat = "Divisional Secretariat";

    private readonly AppDbContext _db = TestDb.Create();
    private readonly ServiceProcedure _service;

    public VerificationControllerTests()
    {
        _service = new ServiceProcedure { ServiceId = "GSN-SRV-001", Name = "Police Clearance", Category = "Legal & Security", Status = "Active" };
        _db.ServiceProcedures.Add(_service);
        _db.SaveChanges();
    }

    private VerificationController Controller(ClaimsPrincipal? user = null)
    {
        // The drafting and citizen-application services are not used by these endpoints
        var controller = new VerificationController(new VerificationService(_db), _db, null!, null!)
            .WithUser(user ?? TestUsers.Officer(Police));
        controller.HttpContext.RequestServices = new ServiceCollection().BuildServiceProvider();
        return controller;
    }

    private async Task<(ApplicationSubmission Submission, VerificationTask Task)> AddApplication(
        string department = Police, int stage = 1, int maxStages = 1)
    {
        var submission = new ApplicationSubmission
        {
            ServiceProcedureId = _service.Id,
            CitizenNic = TestUsers.CitizenNic,
            CurrentDepartment = department,
            CurrentStage = stage,
            MaxStages = maxStages,
            FormDataJson = "{\"Full name\":\"Nimal Silva\"}"
        };
        _db.ApplicationSubmissions.Add(submission);
        await _db.SaveChangesAsync();

        var task = new VerificationTask
        {
            ApplicationId = submission.Id,
            Department = department,
            StageNumber = stage,
            CurrentStage = stage,
            MaxStages = maxStages,
            Status = "Pending",
            CreatedDate = DateTime.UtcNow
        };
        _db.VerificationTasks.Add(task);
        await _db.SaveChangesAsync();
        return (submission, task);
    }

    private async Task AddStageTemplate(int stage, string? department = null, decimal? fee = null)
    {
        var template = new Template { FormName = $"Stage {stage}", ServiceProcedureId = _service.Id, StageOrder = stage, Department = department };
        template.Fields.Add(new FormField { Label = "Full name", Type = "text" });
        if (fee != null)
            template.Fields.Add(new FormField { Label = "Stage fee", Type = "payment", Options = $"{{\"amount\": {fee}}}" });
        _db.Templates.Add(template);
        await _db.SaveChangesAsync();
    }

    private async Task AddPayment(int applicationId, string status)
    {
        _db.Payments.Add(new Payment { ApplicationId = applicationId, Amount = 1500m, Status = status, UserEmail = TestUsers.CitizenEmail });
        await _db.SaveChangesAsync();
    }

    private static VerificationDecisionRequest Decision(string status) => new() { Status = status, Comments = "Checked" };

    // ---- Department-based access ----

    [Fact]
    public async Task TaskDetail_OfficerFromAnotherDepartment_IsForbidden()
    {
        var (_, task) = await AddApplication(Police);

        Assert.IsType<ForbidResult>(await Controller(TestUsers.Officer(Secretariat)).GetTaskDetail(task.Id));
    }

    [Fact]
    public async Task TaskDetail_OfficerOfTheTasksDepartment_SeesTheAnswers_IgnoringCase()
    {
        var (_, task) = await AddApplication(Police);

        var body = TestJson.Body(await Controller(TestUsers.Officer("police department")).GetTaskDetail(task.Id));

        Assert.Equal("Nimal Silva", body.GetProperty("answers").GetProperty("Full name").GetString());
    }

    [Theory]
    [InlineData("System Admin")]
    [InlineData("Admin")]
    public async Task TaskDetail_SystemAdmins_SeeEveryDepartment(string role)
    {
        var (_, task) = await AddApplication(Police);

        Assert.IsType<OkObjectResult>(await Controller(TestUsers.Officer(Secretariat, role)).GetTaskDetail(task.Id));
    }

    [Fact]
    public async Task TaskDetail_StaffWithoutADepartment_AreNotScoped()
    {
        var (_, task) = await AddApplication(Police);

        Assert.IsType<OkObjectResult>(await Controller(TestUsers.Officer(null, "Auditor")).GetTaskDetail(task.Id));
    }

    [Fact]
    public async Task TaskDetail_UnknownTask_IsNotFound() =>
        Assert.IsType<NotFoundResult>(await Controller().GetTaskDetail(404));

    [Fact]
    public async Task PendingQueue_ShowsOnlyTheOfficersDepartment_ButAdminsSeeAll()
    {
        await AddApplication(Police);
        await AddApplication(Secretariat);

        var police = Assert.IsType<OkObjectResult>(await Controller(TestUsers.Officer(Police)).GetPendingTasks(null));
        var admin = Assert.IsType<OkObjectResult>(await Controller(TestUsers.Officer(Police, "System Admin")).GetPendingTasks(null));

        Assert.Single(Assert.IsAssignableFrom<IEnumerable<object>>(police.Value));
        Assert.Equal(2, Assert.IsAssignableFrom<IEnumerable<object>>(admin.Value).Count());
    }

    // ---- Payment approval lock (RecordDecision) ----

    [Fact]
    public async Task Approve_StageWithAFee_AndNoPayment_IsBlocked_AndNothingChanges()
    {
        var (submission, task) = await AddApplication();
        await AddStageTemplate(1, fee: 1500m);

        var result = await Controller().RecordDecision(task.Id, Decision("Approved"));

        var bad = Assert.IsType<BadRequestObjectResult>(result);
        Assert.Contains("Statutory payment has not been verified", TestJson.Body(bad).GetProperty("message").GetString());
        Assert.Equal("Pending", (await _db.VerificationTasks.SingleAsync()).Status);
        Assert.Equal("PendingReview", (await _db.ApplicationSubmissions.SingleAsync(s => s.Id == submission.Id)).StageStatus);
        Assert.Empty(await _db.OfficerReviews.ToListAsync());
    }

    [Theory]
    [InlineData("Pending")]
    [InlineData("PendingVerification")]
    [InlineData("Failed")]
    public async Task Approve_StageWithAFee_PaymentNotYetCleared_IsBlocked(string paymentStatus)
    {
        var (submission, task) = await AddApplication();
        await AddStageTemplate(1, fee: 1500m);
        await AddPayment(submission.Id, paymentStatus);

        Assert.IsType<BadRequestObjectResult>(await Controller().RecordDecision(task.Id, Decision("Approved")));
    }

    [Theory]
    [InlineData("Paid")]
    [InlineData("Verified")]
    public async Task Approve_StageWithAFee_ClearedPayment_CompletesTheApplication(string paymentStatus)
    {
        var (submission, task) = await AddApplication();
        await AddStageTemplate(1, fee: 1500m);
        await AddPayment(submission.Id, paymentStatus);

        Assert.IsType<OkResult>(await Controller().RecordDecision(task.Id, Decision("Approved")));

        Assert.Equal("Approved", (await _db.VerificationTasks.SingleAsync()).Status);
        Assert.Equal("Completed", (await _db.ApplicationSubmissions.SingleAsync()).StageStatus);
        Assert.Equal("officer@gov.lk (Police Department)", (await _db.OfficerReviews.SingleAsync()).OfficerId);
    }

    [Fact]
    public async Task Approve_StageWithoutAFee_NeedsNoPayment()
    {
        var (_, task) = await AddApplication();
        await AddStageTemplate(1);

        Assert.IsType<OkResult>(await Controller().RecordDecision(task.Id, Decision("Approved")));
    }

    [Fact]
    public async Task Reject_IsNeverBlockedByThePaymentLock()
    {
        var (_, task) = await AddApplication();
        await AddStageTemplate(1, fee: 1500m);

        Assert.IsType<OkResult>(await Controller().RecordDecision(task.Id, Decision("Rejected")));

        Assert.Equal("ActionRequired", (await _db.ApplicationSubmissions.SingleAsync()).StageStatus);
        Assert.Equal("Rejected", (await _db.VerificationTasks.SingleAsync()).Status);
    }

    [Theory]
    [InlineData("Suspended", "Suspended")]
    [InlineData("Revision Requested", "Revised")]
    public async Task OtherDecisions_SendTheApplicationBackToTheCitizen(string decision, string taskStatus)
    {
        var (_, task) = await AddApplication();

        await Controller().RecordDecision(task.Id, Decision(decision));

        Assert.Equal("ActionRequired", (await _db.ApplicationSubmissions.SingleAsync()).StageStatus);
        Assert.Equal(taskStatus, (await _db.VerificationTasks.SingleAsync()).Status);
    }

    [Fact]
    public async Task Approve_AnEarlierStage_MarksItStageApproved()
    {
        var (_, task) = await AddApplication(stage: 1, maxStages: 2);

        await Controller().RecordDecision(task.Id, Decision("Approved"));

        Assert.Equal("StageApproved", (await _db.ApplicationSubmissions.SingleAsync()).StageStatus);
    }

    [Fact]
    public async Task Decision_UnknownTask_IsNotFound() =>
        Assert.IsType<NotFoundObjectResult>(await Controller().RecordDecision(404, Decision("Approved")));

    // ---- Payment approval lock (ApproveStage) ----

    [Fact]
    public async Task ApproveStage_WithAnUnclearedFee_IsBlocked()
    {
        var (submission, task) = await AddApplication(stage: 1, maxStages: 2);
        await AddStageTemplate(1, fee: 1500m);
        await AddPayment(submission.Id, "PendingVerification");

        var result = await Controller().ApproveStage(task.Id, new VerificationController.ApproveStageRequest());

        Assert.IsType<BadRequestObjectResult>(result);
        Assert.Equal(1, (await _db.ApplicationSubmissions.SingleAsync()).CurrentStage);
    }

    [Fact]
    public async Task ApproveStage_MovesTheApplicationToTheNextStagesDepartment_AndAuditsIt()
    {
        var (submission, task) = await AddApplication(Police, stage: 1, maxStages: 2);
        await AddStageTemplate(1, Police, fee: 1500m);
        await AddStageTemplate(2, Secretariat);
        await AddPayment(submission.Id, "Paid");

        var body = TestJson.Body(await Controller().ApproveStage(task.Id, new VerificationController.ApproveStageRequest { Notes = "All good" }));

        Assert.Equal(Secretariat, body.GetProperty("currentDepartment").GetString());
        var stored = await _db.ApplicationSubmissions.SingleAsync();
        Assert.Equal(2, stored.CurrentStage);
        Assert.Equal("StageApproved", stored.StageStatus);
        Assert.Equal("All good", (await _db.OfficerReviews.SingleAsync()).Comments);
        Assert.Equal($"Stage 1 Milestone Approved by {Police}", (await _db.AuditLogs.SingleAsync()).Action);
    }

    [Fact]
    public async Task ApproveStage_NextStageWithoutATemplate_WaitsForTheFee()
    {
        var (_, task) = await AddApplication(stage: 1, maxStages: 2);

        await Controller().ApproveStage(task.Id, new VerificationController.ApproveStageRequest());

        Assert.Equal("AwaitingFeePayment", (await _db.ApplicationSubmissions.SingleAsync()).StageStatus);
    }

    [Fact]
    public async Task ApproveStage_LastStage_CompletesTheApplication()
    {
        var (_, task) = await AddApplication(stage: 2, maxStages: 2);

        await Controller().ApproveStage(task.Id, new VerificationController.ApproveStageRequest());

        var stored = await _db.ApplicationSubmissions.SingleAsync();
        Assert.Equal("Completed", stored.StageStatus);
        Assert.Equal(2, stored.CurrentStage);
    }

    // ---- Rejection reasons and deleting applications ----

    [Theory]
    [InlineData("E", "Blurred scan")]
    [InlineData("ERR 101", "Blurred scan")]
    [InlineData("ERR-101", "ab")]
    public async Task RejectionReason_BadCodeOrDescription_IsRejected(string code, string description)
    {
        var result = await Controller().CreateRejectionReason(new RejectionReason { Code = code, Description = description });

        Assert.IsType<BadRequestObjectResult>(result);
        Assert.Empty(await _db.RejectionReasons.ToListAsync());
    }

    [Fact]
    public async Task DeleteApplication_WithoutATask_MarksItDeleted_AndAuditsTheOfficer()
    {
        var submission = new ApplicationSubmission { ServiceProcedureId = _service.Id, CitizenNic = TestUsers.CitizenNic };
        _db.ApplicationSubmissions.Add(submission);
        await _db.SaveChangesAsync();

        Assert.IsType<OkObjectResult>(await Controller().DeleteApplication(submission.Id, reason: "Duplicate"));

        Assert.Equal("Deleted", (await _db.ApplicationSubmissions.SingleAsync()).StageStatus);
        var audit = await _db.AuditLogs.SingleAsync();
        Assert.Equal("officer@gov.lk (Police Department)", audit.PerformedBy);
        Assert.EndsWith("Reason: Duplicate", audit.NewValues);
        Assert.IsType<NotFoundObjectResult>(await Controller().DeleteApplication(404));
    }
}
