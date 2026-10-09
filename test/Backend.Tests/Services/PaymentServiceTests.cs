using Government_Service_Navigator.Backend.Data.Context;
using Government_Service_Navigator.Backend.Models.Entities;
using Government_Service_Navigator.Backend.Services;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace Government_Service_Navigator.Backend.Tests.Services;

/// <summary>
/// Manual (bank slip) payments, officer status changes, the payment ledger, and how a cleared
/// payment moves the application along. Stripe calls are not made: only the paths before them.
/// </summary>
public class PaymentServiceTests
{
    private const string Email = TestUsers.CitizenEmail;

    private readonly AppDbContext _db = TestDb.Create();
    private readonly RecordingNotifications _notifications = new();
    private readonly PaymentService _payments;

    public PaymentServiceTests() => _payments = new PaymentService(_db, _notifications);

    private async Task<Payment> AddPayment(int applicationId = 1, string status = "PendingVerification", decimal amount = 1500m, string email = Email)
    {
        var payment = new Payment { ApplicationId = applicationId, Amount = amount, Status = status, UserEmail = email, Method = "Manual" };
        _db.Payments.Add(payment);
        await _db.SaveChangesAsync();
        return payment;
    }

    private async Task<ApplicationSubmission> AddSubmission(string formData = "{}", int maxStages = 1)
    {
        var submission = new ApplicationSubmission { ServiceProcedureId = 1, CitizenNic = TestUsers.CitizenNic, FormDataJson = formData, MaxStages = maxStages };
        _db.ApplicationSubmissions.Add(submission);
        await _db.SaveChangesAsync();
        return submission;
    }

    // ---- Manual payments ----

    [Fact]
    public async Task CreateManualPayment_WaitsForVerification_AndTellsTheCitizen()
    {
        var payment = await _payments.CreateManualPaymentAsync(7, 2500m, Email, "/slips/abc");

        Assert.Equal("PendingVerification", payment.Status);
        Assert.Equal("Manual", payment.Method);
        Assert.Equal("LKR", payment.Currency);
        Assert.Equal("/slips/abc", payment.ManualSlipUrl);
        Assert.Equal($"PaymentStatus:{Email}:PendingVerification", Assert.Single(_notifications.Sent));
    }

    [Fact]
    public async Task VerifyManualPayment_Approved_MarksItPaid_DropsDuplicateSlips_AndAudits()
    {
        var payment = await AddPayment(applicationId: 9);
        var duplicate = await AddPayment(applicationId: 9);
        var otherApplication = await AddPayment(applicationId: 10);

        var verified = await _payments.VerifyManualPaymentAsync(payment.Id, approved: true, note: null);

        Assert.Equal("Paid", verified.Status);
        Assert.NotNull(verified.PaidDate);
        Assert.Null(await _db.Payments.FindAsync(duplicate.Id));
        Assert.NotNull(await _db.Payments.FindAsync(otherApplication.Id));
        var audit = await _db.AuditLogs.SingleAsync();
        Assert.Equal("PaymentVerified", audit.Action);
        Assert.Equal($"PaymentId={payment.Id}, Status=Paid", audit.NewValues);
        Assert.Contains($"PaymentStatus:{Email}:Paid", _notifications.Sent);
    }

    [Fact]
    public async Task VerifyManualPayment_Rejected_MarksItFailed()
    {
        var payment = await AddPayment();

        var result = await _payments.VerifyManualPaymentAsync(payment.Id, approved: false, note: "Slip unreadable");

        Assert.Equal("Failed", result.Status);
        Assert.Null(result.PaidDate);
    }

    [Fact]
    public async Task VerifyManualPayment_UnknownPayment_Throws() =>
        await Assert.ThrowsAsync<KeyNotFoundException>(() => _payments.VerifyManualPaymentAsync(404, true, null));

    // ---- Effect on the application ----

    [Fact]
    public async Task PaidFee_SendsAnApplicationWithAStageTask_BackToVerification()
    {
        var submission = await AddSubmission(maxStages: 2);
        _db.VerificationTasks.Add(new VerificationTask { ApplicationId = submission.Id, StageNumber = 1, Status = "Pending", CreatedDate = DateTime.UtcNow });
        var payment = await AddPayment(applicationId: submission.Id);

        await _payments.VerifyManualPaymentAsync(payment.Id, true, null);

        Assert.Equal("UnderVerification", (await _db.ApplicationSubmissions.SingleAsync()).StageStatus);
    }

    [Fact]
    public async Task PaidFee_ForADirectDepartmentPayment_CompletesTheApplication()
    {
        var submission = await AddSubmission("{\"PaymentType\":\"Direct Department Payment\"}");
        var payment = await AddPayment(applicationId: submission.Id);

        await _payments.VerifyManualPaymentAsync(payment.Id, true, null);

        Assert.Equal("Completed", (await _db.ApplicationSubmissions.SingleAsync()).StageStatus);
    }

    // ---- Officer status changes ----

    [Theory]
    [InlineData("verified", "Paid")]
    [InlineData("PAID", "Paid")]
    [InlineData("rejected", "Failed")]
    [InlineData("failed", "Failed")]
    [InlineData("pending", "PendingVerification")]
    public async Task UpdatePaymentStatus_NormalisesTheStatus(string requested, string stored)
    {
        var payment = await AddPayment();

        var result = await _payments.UpdatePaymentStatusAsync(payment.Id, requested, null, "finance@gov.lk");

        Assert.Equal(stored, result.Status);
    }

    [Fact]
    public async Task UpdatePaymentStatus_BackToPending_ClearsThePaidDate_AndAuditsTheOfficersNote()
    {
        var payment = await AddPayment(status: "Paid");
        payment.PaidDate = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        var result = await _payments.UpdatePaymentStatusAsync(payment.Id, "pending", "Wrong slip attached", "finance@gov.lk");

        Assert.Null(result.PaidDate);
        var audit = await _db.AuditLogs.SingleAsync();
        Assert.Equal("Payment Status Updated: PendingVerification", audit.Action);
        Assert.Equal("finance@gov.lk", audit.PerformedBy);
        Assert.Contains("Note=Wrong slip attached", audit.NewValues);
    }

    [Fact]
    public async Task UpdatePaymentStatus_UnknownPayment_Throws() =>
        await Assert.ThrowsAsync<KeyNotFoundException>(() => _payments.UpdatePaymentStatusAsync(404, "paid", null, "finance"));

    // ---- Ledger ----

    [Fact]
    public async Task Ledger_SubtractsOnlyCompletedRefunds()
    {
        var payment = await AddPayment(status: "Paid", amount: 5000m);
        _db.RefundRequests.AddRange(
            new RefundRequest { PaymentId = payment.Id, RefundAmount = 2000m, Reason = "Overpaid", Status = RefundStatus.Completed, CompletedDate = DateTime.UtcNow },
            new RefundRequest { PaymentId = payment.Id, RefundAmount = 999m, Reason = "Pending one", Status = RefundStatus.Pending });
        await _db.SaveChangesAsync();

        var ledger = await _payments.GetLedgerAsync(payment.Id);

        Assert.Equal(5000m, ledger.OriginalAmount);
        Assert.Equal(2000m, ledger.TotalRefunded);
        Assert.Equal(3000m, ledger.RunningBalance);
        Assert.Equal(new[] { "Payment", "Refund" }, ledger.Entries.Select(e => e.Type));
        Assert.Equal(-2000m, ledger.Entries[1].Amount);
    }

    [Fact]
    public async Task Ledger_UnknownPayment_Throws() =>
        await Assert.ThrowsAsync<KeyNotFoundException>(() => _payments.GetLedgerAsync(404));

    // ---- Stripe confirmation guards ----

    [Fact]
    public async Task ConfirmStripePayment_AlreadyPaid_ReturnsItWithoutASecondReceipt()
    {
        var payment = await AddPayment(status: "Paid");

        var result = await _payments.ConfirmStripePaymentAsync(payment.Id);

        Assert.Equal("Paid", result.Status);
        Assert.Empty(_notifications.Sent);
    }

    [Fact]
    public async Task ConfirmStripePayment_WithoutACheckoutSession_IsRefused()
    {
        var payment = await AddPayment(status: "Pending");

        await Assert.ThrowsAsync<InvalidOperationException>(() => _payments.ConfirmStripePaymentAsync(payment.Id));
    }

    // ---- Payment history ----

    [Fact]
    public async Task GetByUser_ReturnsTheCitizensPayments_IgnoringEmailCase()
    {
        await AddPayment(email: "Citizen@Example.lk");
        await AddPayment(email: "someone@example.lk");

        var mine = await _payments.GetByUserAsync(Email);

        Assert.Single(mine);
    }

    [Fact]
    public async Task GetByUser_NoPaymentsOfTheirOwn_ReturnsEmptyList()
    {
        await AddPayment(email: "someone@example.lk");

        var result = await _payments.GetByUserAsync("new.citizen@example.lk");

        Assert.Empty(result);
    }
}