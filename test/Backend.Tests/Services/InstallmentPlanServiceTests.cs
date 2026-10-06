using Government_Service_Navigator.Backend.Data.Context;
using Government_Service_Navigator.Backend.Models.Entities;
using Government_Service_Navigator.Backend.Services;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace Government_Service_Navigator.Backend.Tests.Services;

/// <summary>
/// Installment plans: splitting the fee, paying each installment (online or by bank transfer
/// receipt), completing or cancelling the plan, and who owns an installment.
/// </summary>
public class InstallmentPlanServiceTests
{
    private readonly AppDbContext _db = TestDb.Create();
    private readonly InstallmentPlanService _plans;

    public InstallmentPlanServiceTests() => _plans = new InstallmentPlanService(_db, new RecordingNotifications());

    private async Task<Payment> AddPayment(decimal amount = 1000m, int applicationId = 1)
    {
        var payment = new Payment { ApplicationId = applicationId, Amount = amount, Status = "Pending", UserEmail = TestUsers.CitizenEmail };
        _db.Payments.Add(payment);
        await _db.SaveChangesAsync();
        return payment;
    }

    private async Task<InstallmentPlan> NewPlan(int installments = 2)
    {
        var payment = await AddPayment();
        return await _plans.CreatePlanAsync(payment.Id, installments, intervalDays: 30);
    }

    // ---- Creating a plan ----

    [Fact]
    public async Task CreatePlan_SplitsEvenly_WithTheRoundingRemainderOnTheLastInstallment()
    {
        var payment = await AddPayment(1000m);

        var plan = await _plans.CreatePlanAsync(payment.Id, 3, intervalDays: 30);

        var installments = plan.Installments!.OrderBy(i => i.InstallmentNumber).ToList();
        Assert.Equal(new[] { 333.33m, 333.33m, 333.34m }, installments.Select(i => i.Amount));
        Assert.Equal(1000m, installments.Sum(i => i.Amount));
        Assert.All(installments, i => Assert.Equal("Pending", i.Status));
        Assert.Equal(30, (installments[1].DueDate - installments[0].DueDate).Days);
        Assert.Equal("Active", plan.Status);
    }

    [Fact]
    public async Task CreatePlan_NeedsAtLeastTwoInstallments()
    {
        var payment = await AddPayment();

        await Assert.ThrowsAsync<ArgumentException>(() => _plans.CreatePlanAsync(payment.Id, 1, 30));
    }

    [Fact]
    public async Task CreatePlan_OnlyOneActivePlanPerPayment()
    {
        var payment = await AddPayment();
        await _plans.CreatePlanAsync(payment.Id, 2, 30);

        await Assert.ThrowsAsync<InvalidOperationException>(() => _plans.CreatePlanAsync(payment.Id, 3, 30));
    }

    [Fact]
    public async Task CreatePlan_UnknownPayment_Throws() =>
        await Assert.ThrowsAsync<KeyNotFoundException>(() => _plans.CreatePlanAsync(404, 2, 30));

    // ---- Paying ----

    [Fact]
    public async Task MarkPaid_LastInstallment_CompletesThePlanAndThePayment()
    {
        var plan = await NewPlan(2);
        var ids = plan.Installments!.Select(i => i.Id).ToList();

        await _plans.MarkInstallmentPaidAsync(ids[0]);
        Assert.Equal("Active", (await _db.InstallmentPlans.SingleAsync()).Status);

        await _plans.MarkInstallmentPaidAsync(ids[1]);

        Assert.Equal("Completed", (await _db.InstallmentPlans.SingleAsync()).Status);
        var payment = await _db.Payments.SingleAsync();
        Assert.Equal("Paid", payment.Status);
        Assert.NotNull(payment.PaidDate);
    }

    [Fact]
    public async Task MarkPaid_Twice_IsRefused()
    {
        var plan = await NewPlan();
        var id = plan.Installments!.First().Id;
        await _plans.MarkInstallmentPaidAsync(id);

        await Assert.ThrowsAsync<InvalidOperationException>(() => _plans.MarkInstallmentPaidAsync(id));
        await Assert.ThrowsAsync<KeyNotFoundException>(() => _plans.MarkInstallmentPaidAsync(404));
    }

    [Fact]
    public async Task GetById_FlagsPastDueInstallmentsAsOverdue()
    {
        var plan = await NewPlan();
        var first = await _db.Installments.OrderBy(i => i.InstallmentNumber).FirstAsync();
        first.DueDate = DateTime.UtcNow.AddDays(-1);
        await _db.SaveChangesAsync();

        var dto = await _plans.GetByIdAsync(plan.Id);

        Assert.Equal(new[] { "Overdue", "Pending" }, dto!.Installments.OrderBy(i => i.InstallmentNumber).Select(i => i.Status));
        Assert.Equal("Overdue", (await _db.Installments.FindAsync(first.Id))!.Status);
    }

    /// <summary>Known gap: an id that matches no plan returns the newest plan, which may be another citizen's.</summary>
    [Fact]
    public async Task GetById_UnknownId_FallsBackToTheNewestPlan()
    {
        var plan = await NewPlan();

        var dto = await _plans.GetByIdAsync(404);

        Assert.Equal(plan.Id, dto!.Id);
    }

    [Fact]
    public async Task GetById_NoPlansAtAll_IsNull() => Assert.Null(await _plans.GetByIdAsync(1));

    // ---- Bank transfers ----

    [Fact]
    public async Task BankTransfer_StoresTheReceipt_AndWaitsForVerification()
    {
        var plan = await NewPlan();
        var id = plan.Installments!.First().Id;

        var installment = await _plans.SubmitBankTransferAsync(id, "slip.pdf", "application/pdf", new byte[] { 1, 2, 3 });

        Assert.Equal("PendingVerification", installment.Status);
        Assert.Equal("BankTransfer", installment.PaymentMethod);
        var receipt = await _plans.GetReceiptAsync(id);
        Assert.Equal("slip.pdf", receipt!.FileName);
        Assert.Equal(3, receipt.SizeBytes);
        await Assert.ThrowsAsync<InvalidOperationException>(() => _plans.SubmitBankTransferAsync(id, "again.pdf", "application/pdf", new byte[] { 1 }));
    }

    [Fact]
    public async Task RejectBankTransfer_MakesTheInstallmentPayableAgain()
    {
        var plan = await NewPlan();
        var id = plan.Installments!.First().Id;
        await _plans.SubmitBankTransferAsync(id, "slip.pdf", "application/pdf", new byte[] { 1 });

        var installment = await _plans.RejectBankTransferAsync(id);

        Assert.Equal("Pending", installment.Status);
        Assert.Null(installment.ReceiptId);
        Assert.Null(await _plans.GetReceiptAsync(id));
        Assert.Single(await _db.PaymentReceipts.ToListAsync());
        await Assert.ThrowsAsync<InvalidOperationException>(() => _plans.RejectBankTransferAsync(id));
    }

    [Fact]
    public async Task CancelledPlan_CannotBePaid()
    {
        var plan = await NewPlan();
        await _plans.CancelPlanAsync(plan.Id);

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            _plans.SubmitBankTransferAsync(plan.Installments!.First().Id, "slip.pdf", "application/pdf", new byte[] { 1 }));
    }

    // ---- Cancelling ----

    [Fact]
    public async Task Cancel_ActivePlanWithNothingPaid()
    {
        var plan = await NewPlan();

        var cancelled = await _plans.CancelPlanAsync(plan.Id);

        Assert.Equal("Cancelled", cancelled.Status);
        await Assert.ThrowsAsync<InvalidOperationException>(() => _plans.CancelPlanAsync(plan.Id));
    }

    [Fact]
    public async Task Cancel_AfterAnInstallmentIsPaid_IsRefused()
    {
        var plan = await NewPlan(3);
        await _plans.MarkInstallmentPaidAsync(plan.Installments!.First().Id);

        await Assert.ThrowsAsync<InvalidOperationException>(() => _plans.CancelPlanAsync(plan.Id));
    }

    // ---- Ownership ----

    [Fact]
    public async Task BelongsToCitizen_ByTheApplicationsNic_OrThePaymentEmail()
    {
        var submission = new ApplicationSubmission { ServiceProcedureId = 1, CitizenNic = TestUsers.CitizenNic };
        _db.ApplicationSubmissions.Add(submission);
        await _db.SaveChangesAsync();
        var payment = await AddPayment(applicationId: submission.Id);
        var plan = await _plans.CreatePlanAsync(payment.Id, 2, 30);
        var id = plan.Installments!.First().Id;

        Assert.True(await _plans.BelongsToCitizenAsync(id, TestUsers.CitizenNic, null));
        Assert.True(await _plans.BelongsToCitizenAsync(id, null, "CITIZEN@example.lk"));
        Assert.False(await _plans.BelongsToCitizenAsync(id, "199912345678", "other@example.lk"));
        Assert.False(await _plans.BelongsToCitizenAsync(404, TestUsers.CitizenNic, TestUsers.CitizenEmail));
    }
}
