using Government_Service_Navigator.Backend.Data.Context;
using Government_Service_Navigator.Backend.Models.Entities;
using Government_Service_Navigator.Backend.Services;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace Government_Service_Navigator.Backend.Tests.Services;

/// <summary>
/// Refund requests: who may ask, the 7-day window, one active request at a time, and the
/// Pending -> Approved -> Processing -> Completed lifecycle.
/// </summary>
public class RefundServiceTests
{
    private const string Email = TestUsers.CitizenEmail;

    private readonly AppDbContext _db = TestDb.Create();
    private readonly RecordingNotifications _notifications = new();
    private readonly RefundService _refunds;

    public RefundServiceTests() => _refunds = new RefundService(_db, _notifications);

    private async Task<Payment> AddPaidPayment(int applicationId = 1, string status = "Paid", int paidDaysAgo = 1)
    {
        var payment = new Payment
        {
            ApplicationId = applicationId,
            Amount = 3500m,
            Status = status,
            UserEmail = Email,
            PaidDate = DateTime.UtcNow.AddDays(-paidDaysAgo)
        };
        _db.Payments.Add(payment);
        await _db.SaveChangesAsync();
        return payment;
    }

    private async Task<RefundRequest> AddRefund(int paymentId, RefundStatus status)
    {
        var refund = new RefundRequest { PaymentId = paymentId, RefundAmount = 3500m, Reason = "Earlier", RequestedByEmail = Email, Status = status };
        _db.RefundRequests.Add(refund);
        await _db.SaveChangesAsync();
        return refund;
    }

    // ---- Requesting ----

    [Fact]
    public async Task Create_RefundsTheFullAmount_ForTheApplicationsDepartment()
    {
        var submission = new ApplicationSubmission { ServiceProcedureId = 1, CitizenNic = TestUsers.CitizenNic, CurrentDepartment = "Police Department" };
        _db.ApplicationSubmissions.Add(submission);
        await _db.SaveChangesAsync();
        var payment = await AddPaidPayment(submission.Id);

        var refund = await _refunds.CreateRefundRequestAsync(payment.Id, "Applied twice", "CITIZEN@example.lk");

        Assert.Equal(3500m, refund.RefundAmount);
        Assert.Equal(RefundStatus.Pending, refund.Status);
        Assert.Equal("Police Department", refund.DepartmentName);
        Assert.Equal("RefundRequestCreated", (await _db.AuditLogs.SingleAsync()).Action);
        Assert.Equal("RefundRequested:CITIZEN@example.lk", Assert.Single(_notifications.Sent));
    }

    [Fact]
    public async Task Create_SomeoneElsesPayment_LooksLikeAMissingPayment()
    {
        var payment = await AddPaidPayment();

        await Assert.ThrowsAsync<KeyNotFoundException>(() => _refunds.CreateRefundRequestAsync(payment.Id, "Mine now", "other@example.lk"));
        await Assert.ThrowsAsync<KeyNotFoundException>(() => _refunds.CreateRefundRequestAsync(404, "Missing", Email));
    }

    [Theory]
    [InlineData("PendingVerification")]
    [InlineData("Failed")]
    [InlineData("Refunded")]
    public async Task Create_UnpaidPayment_IsRefused(string status)
    {
        var payment = await AddPaidPayment(status: status);

        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() => _refunds.CreateRefundRequestAsync(payment.Id, "Reason", Email));
        Assert.Contains("Only paid payments", ex.Message);
    }

    [Fact]
    public async Task Create_AfterTheSevenDayWindow_IsRefused()
    {
        var payment = await AddPaidPayment(paidDaysAgo: RefundService.RefundWindowDays + 1);

        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() => _refunds.CreateRefundRequestAsync(payment.Id, "Late", Email));
        Assert.Contains("window has expired", ex.Message);
    }

    [Theory]
    [InlineData(RefundStatus.Pending)]
    [InlineData(RefundStatus.Approved)]
    [InlineData(RefundStatus.Processing)]
    public async Task Create_WhileAnotherRequestIsActive_IsRefused(RefundStatus active)
    {
        var payment = await AddPaidPayment();
        await AddRefund(payment.Id, active);

        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() => _refunds.CreateRefundRequestAsync(payment.Id, "Again", Email));
        Assert.Contains("already exists", ex.Message);
    }

    [Fact]
    public async Task Create_AlreadyRefunded_IsRefused()
    {
        var payment = await AddPaidPayment();
        await AddRefund(payment.Id, RefundStatus.Completed);

        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() => _refunds.CreateRefundRequestAsync(payment.Id, "Again", Email));
        Assert.Contains("already been refunded", ex.Message);
    }

    [Fact]
    public async Task Create_AfterARejectedRequest_IsAllowed()
    {
        var payment = await AddPaidPayment();
        await AddRefund(payment.Id, RefundStatus.Rejected);

        var refund = await _refunds.CreateRefundRequestAsync(payment.Id, "Second try", Email);

        Assert.Equal(RefundStatus.Pending, refund.Status);
    }

    // ---- Lifecycle ----

    [Fact]
    public async Task Lifecycle_ApproveProcessComplete_MarksThePaymentRefunded()
    {
        var payment = await AddPaidPayment();
        var refund = await _refunds.CreateRefundRequestAsync(payment.Id, "Applied twice", Email);

        await _refunds.ApproveAsync(refund.Id, "finance@gov.lk", "OK");
        await _refunds.ProcessAsync(refund.Id, "BANK-REF-77");
        var completed = await _refunds.CompleteAsync(refund.Id);

        Assert.Equal(RefundStatus.Completed, completed.Status);
        Assert.NotNull(completed.CompletedDate);
        Assert.Equal("BANK-REF-77", completed.RefundTransactionRef);
        Assert.Equal("finance@gov.lk", completed.DecidedByEmail);
        Assert.Equal("Refunded", (await _db.Payments.SingleAsync()).Status);
        Assert.Equal(
            new[] { "RefundApproved", "RefundCompleted", "RefundRequestCreated" },
            await _db.AuditLogs.Select(a => a.Action).OrderBy(a => a).ToListAsync());
        Assert.Contains($"RefundCompleted:{Email}", _notifications.Sent);
    }

    [Fact]
    public async Task Reject_RecordsTheDecision_AndTellsTheCitizen()
    {
        var payment = await AddPaidPayment();
        var refund = await AddRefund(payment.Id, RefundStatus.Pending);

        var rejected = await _refunds.RejectAsync(refund.Id, "finance@gov.lk", "Service already delivered");

        Assert.Equal(RefundStatus.Rejected, rejected.Status);
        Assert.Equal("Service already delivered", rejected.DecisionNote);
        Assert.Contains($"RefundRejected:{Email}", _notifications.Sent);
    }

    [Fact]
    public async Task OutOfOrderSteps_AreRefused()
    {
        var payment = await AddPaidPayment();
        var approved = await AddRefund(payment.Id, RefundStatus.Approved);

        await Assert.ThrowsAsync<InvalidOperationException>(() => _refunds.ApproveAsync(approved.Id, "f", null));
        await Assert.ThrowsAsync<InvalidOperationException>(() => _refunds.RejectAsync(approved.Id, "f", null));
        await Assert.ThrowsAsync<InvalidOperationException>(() => _refunds.CompleteAsync(approved.Id));
        await Assert.ThrowsAsync<ArgumentException>(() => _refunds.ProcessAsync(approved.Id, "  "));

        var pending = await AddRefund(payment.Id, RefundStatus.Pending);
        await Assert.ThrowsAsync<InvalidOperationException>(() => _refunds.ProcessAsync(pending.Id, "REF"));
    }

    [Fact]
    public async Task UnknownRefund_Throws()
    {
        await Assert.ThrowsAsync<KeyNotFoundException>(() => _refunds.ApproveAsync(404, "f", null));
        await Assert.ThrowsAsync<KeyNotFoundException>(() => _refunds.RejectAsync(404, "f", null));
        await Assert.ThrowsAsync<KeyNotFoundException>(() => _refunds.ProcessAsync(404, "REF"));
        await Assert.ThrowsAsync<KeyNotFoundException>(() => _refunds.CompleteAsync(404));
    }

    // ---- Queries ----

    [Fact]
    public async Task GetAll_FiltersByStatus_IgnoringCase()
    {
        var payment = await AddPaidPayment();
        await AddRefund(payment.Id, RefundStatus.Rejected);
        await AddRefund(payment.Id, RefundStatus.Pending);

        Assert.Single(await _refunds.GetAllAsync("pending", null));
        Assert.Equal(2, (await _refunds.GetAllAsync(null, null)).Count);
        Assert.Equal(2, (await _refunds.GetAllAsync("not-a-status", null)).Count);
    }

    [Fact]
    public async Task GetByRequester_OnlyReturnsTheirRequests()
    {
        var payment = await AddPaidPayment();
        await AddRefund(payment.Id, RefundStatus.Pending);
        _db.RefundRequests.Add(new RefundRequest { PaymentId = payment.Id, RequestedByEmail = "other@example.lk", Reason = "x" });
        await _db.SaveChangesAsync();

        Assert.Single(await _refunds.GetByRequesterAsync(Email));
    }
}
