using Xunit;

namespace Government_Service_Navigator.Backend.Tests.Security;

/// <summary>
/// The auth that applies to every endpoint, read from the controllers' [Authorize] and [AllowAnonymous]
/// attributes. These lists are the current state, gaps included (see docs/api.md, "How auth actually
/// works"). A failure here means an endpoint's protection changed: update the list only if that was
/// intended, and keep docs/api.md in step.
/// </summary>
public class AuthorizationMatrixTests
{
    // Callable with no token. Known gaps (docs/api.md): the admin, department, catalog, template, agent
    // and RAG endpoints, Applications.RaiseConcern / SubmitRevision, and the dev-only Verification.SeedTasks.
    private static readonly string[] Unauthenticated =
    {
        "ActionAgent.BookAppointment",
        "ActionAgent.OrchestrateDraft",
        "ActionAgent.PrepareDraft",
        "Admin.ActivateOfficer",
        "Admin.AddOfficer",
        "Admin.GetAllOfficers",
        "Admin.ResetOfficerPassword",
        "Admin.SuspendOfficer",
        "Admin.UpdateOfficer",
        "Applications.RaiseConcern",
        "Applications.SubmitRevision",
        "Auth.AdminLogin",
        "Auth.Login",
        "Auth.OfficerLogin",
        "Auth.Register",
        "CollectionSlots.GetAllSlots",
        "CollectionSlots.GetBookings",
        "CollectionSlots.GetDailySchedule",
        "CollectionSlots.GetHolidays",
        "Departments.CreateDepartment",
        "Departments.DeleteDepartment",
        "Departments.GetAllDepartments",
        "Departments.GetDepartmentById",
        "Departments.GetNextDepartmentCode",
        "Departments.ToggleStatus",
        "Departments.UpdateDepartment",
        "EligibilityAgent.EvaluateEligibility",
        "EligibilityAgent.OrchestrateEligibility",
        "IntakeAgent.AskAgent",
        "RagSetup.ClearServiceKnowledge",
        "RagSetup.GetServiceKnowledge",
        "RagSetup.IngestLocalDocuments",
        "RagSetup.SeedActionAgentKnowledge",
        "RagSetup.SeedDatabase",
        "RagSetup.UploadPolicy",
        "Services.CalculateEligibilityScore",
        "Services.CreateService",
        "Services.DeleteDocumentRequirement",
        "Services.DeleteFeeSchedule",
        "Services.DeleteService",
        "Services.GetAllServices",
        "Services.GetService",
        "Services.GetServiceStageDetails",
        "Services.UpdateDocumentRequirements",
        "Services.UpdateEligibilityRules",
        "Services.UpdateFeeSchedules",
        "Services.UpdateService",
        "Services.UpdateWorkflow",
        "Template.CreateTemplate",
        "Template.DeleteTemplate",
        "Template.GetAllTemplates",
        "Template.GetTemplateById",
        "Template.GetTemplatesByService",
        "Template.UpdateTemplate",
        "Template.UpdateTemplateStatus",
        "ValidationAgent.CompileCaseDossier",
        "ValidationAgent.DraftDecisionOrder",
        "ValidationAgent.DraftRemediationNotice",
        "ValidationAgent.GetAgentStatus",
        "ValidationAgent.GetApplicationSafetyBriefing",
        "ValidationAgent.OrchestrateValidation",
        "ValidationAgent.RunGoldenCasesEvaluation",
        "ValidationAgent.ValidateDraft",
        "Verification.SeedTasks",
    };

    // [Authorize] with no role: any valid citizen, officer or admin token.
    private static readonly string[] AnyToken =
    {
        "Analytics.DeleteSnapshot",
        "Analytics.GetApprovalLikelihood",
        "Analytics.GetDaily",
        "Analytics.GetMonthly",
        "Analytics.GetOpenAnomalies",
        "Analytics.GetWeekly",
        "Analytics.GetYearly",
        "Analytics.ListSnapshots",
        "Analytics.ResolveAnomaly",
        "Analytics.RunAnomalyDetection",
        "Analytics.SaveSnapshot",
        "AnomalyDetection.GetOpenFlags",
        "AnomalyDetection.Resolve",
        "AnomalyDetection.Scan",
        "Applications.Finalize",
        "Applications.GetDraft",
        "Applications.GetForm",
        "Applications.GetStages",
        "Applications.SaveDraft",
        "Applications.Submit",
        "Applications.SubmitStage",
        "Applications.UploadDocument",
        "AuditLogs.GetByAction",
        "AuditLogs.GetByApplication",
        "AuditLogs.GetById",
        "AuditLogs.GetByPerformer",
        "AuditLogs.GetRecent",
        "Auth.Logout",
        "InstallmentPlans.Cancel",
        "InstallmentPlans.Checkout",
        "InstallmentPlans.ConfirmCheckout",
        "InstallmentPlans.CreatePlan",
        "InstallmentPlans.GetBankDetails",
        "InstallmentPlans.GetById",
        "InstallmentPlans.SubmitBankTransfer",
        "Notifications.GetMine",
        "Notifications.MarkAllRead",
        "Notifications.MarkRead",
        "Payments.ConfirmPayment",
        "Payments.CreateCheckout",
        "Payments.CreateManualPayment",
        "Payments.DepartmentPay",
        "Payments.GetById",
        "Payments.GetLedger",
        "Payments.GetMine",
        "Refunds.Create",
        "Refunds.GetById",
        "Refunds.GetMine",
        "Refunds.GetStatus",
        "Verification.GetMyApplications",
        "WeatherForecast.Get",
    };

    // [Authorize(Roles = ...)], grouped by the exact role list.
    private static readonly Dictionary<string, string[]> RoleProtected = new()
    {
        ["Admin,Department Admin,DepartmentAdmin,Finance Officer,Officer,SuperAdmin,System Admin,Verifying Officer"] = new[]
        {
            "CollectionSlots.AddHoliday",
            "CollectionSlots.CreateSlot",
            "CollectionSlots.DeleteHoliday",
            "CollectionSlots.DeleteSlot",
            "CollectionSlots.UpdateSlot",
        },
        ["Admin,Department Admin,Finance Officer,Officer,System Admin,Verifying Officer"] = new[]
        {
            "InstallmentPlans.GetReceipt",
            "InstallmentPlans.MarkPaid",
            "InstallmentPlans.RejectBankTransfer",
        },
        ["Admin,Department Admin,Finance Officer,System Admin"] = new[]
        {
            "Payments.GetDepartmentPayments",
            "Payments.GetPendingSlips",
            "Payments.UpdateStatus",
            "Payments.Verify",
            "Refunds.Approve",
            "Refunds.Complete",
            "Refunds.GetAll",
            "Refunds.Process",
            "Refunds.Reject",
        },
        ["Admin,Auditor,Department Admin,Finance Officer,Officer,System Admin,Verifying Officer"] = new[]
        {
            "Verification.ApproveStage",
            "Verification.BulkVerify",
            "Verification.CreateRejectionReason",
            "Verification.CreateVerificationTask",
            "Verification.DeleteApplication",
            "Verification.DeleteRejectionReason",
            "Verification.DeleteTask",
            "Verification.DeleteTaskPost",
            "Verification.GenerateAgentDraft",
            "Verification.GetAgentDraft",
            "Verification.GetAllAuditLogs",
            "Verification.GetAuditLogs",
            "Verification.GetAuditLogSummary",
            "Verification.GetDocumentContent",
            "Verification.GetOfficerStats",
            "Verification.GetPendingTasks",
            "Verification.GetRejectionReasons",
            "Verification.GetTaskDetail",
            "Verification.GetTaskSummary",
            "Verification.GetVerifiedTasks",
            "Verification.RecordDecision",
            "Verification.UpdateRejectionReason",
        },
    };

    private static string[] Keys(string tier) =>
        EndpointAuth.All.Where(e => e.Tier == tier).Select(e => e.Key).OrderBy(k => k).ToArray();

    [Fact]
    public void UnauthenticatedEndpoints_AreExactlyTheKnownList()
    {
        Assert.Equal(Unauthenticated.OrderBy(k => k), Keys("None"));
    }

    [Fact]
    public void AnyTokenEndpoints_AreExactlyTheKnownList()
    {
        Assert.Equal(AnyToken.OrderBy(k => k), Keys("AnyToken"));
    }

    [Fact]
    public void RoleProtectedEndpoints_HaveTheirExpectedRoles()
    {
        var actual = EndpointAuth.All
            .Where(e => e.Tier == "Role")
            .GroupBy(e => string.Join(",", e.Roles))
            .ToDictionary(g => g.Key, g => g.Select(e => e.Key).OrderBy(k => k).ToArray());

        Assert.Equal(RoleProtected.Keys.OrderBy(k => k), actual.Keys.OrderBy(k => k));
        foreach (var (roles, keys) in RoleProtected)
            Assert.Equal(keys.OrderBy(k => k), actual[roles]);
    }

    [Fact]
    public void CitizenRole_IsNeverAllowedOnStaffEndpoints()
    {
        Assert.DoesNotContain(EndpointAuth.All, e => e.Tier == "Role" && e.Roles.Contains("User"));
    }

    [Theory]
    [InlineData("Verification.RecordDecision")]
    [InlineData("Verification.ApproveStage")]
    [InlineData("Verification.BulkVerify")]
    [InlineData("Payments.Verify")]
    [InlineData("Payments.UpdateStatus")]
    [InlineData("Refunds.Approve")]
    [InlineData("InstallmentPlans.MarkPaid")]
    public void DecisionAndMoneyEndpoints_RequireAStaffRole(string key)
    {
        var endpoint = Assert.Single(EndpointAuth.All, e => e.Key == key);

        Assert.Equal("Role", endpoint.Tier);
    }

    [Fact]
    public void FinanceDecisions_AreLimitedToFinanceAndAdmins()
    {
        var verify = Assert.Single(EndpointAuth.All, e => e.Key == "Payments.Verify");

        Assert.DoesNotContain("Verifying Officer", verify.Roles);
        Assert.Contains("Finance Officer", verify.Roles);
    }
}
