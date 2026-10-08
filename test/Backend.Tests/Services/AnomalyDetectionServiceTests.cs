using Government_Service_Navigator.Backend.Data.Context;
using Government_Service_Navigator.Backend.Models.Entities;
using Government_Service_Navigator.Backend.Services;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace Government_Service_Navigator.Backend.Tests.Services;

/// <summary>The anomaly scan rules (very large payments, refunds asked for right after paying) and resolving flags.</summary>
public class AnomalyDetectionServiceTests
{
    private readonly AppDbContext _db = TestDb.Create();
    private readonly AnomalyDetectionService _anomalies;

    public AnomalyDetectionServiceTests() => _anomalies = new AnomalyDetectionService(_db);

    private async Task<Payment> AddPayment(decimal amount, string status = "Paid", DateTime? paidDate = null)
    {
        var payment = new Payment { ApplicationId = 1, Amount = amount, Status = status, UserEmail = TestUsers.CitizenEmail, PaidDate = paidDate };
        _db.Payments.Add(payment);
        await _db.SaveChangesAsync();
        return payment;
    }

    [Fact]
    public async Task Scan_FlagsPaidPaymentsFromTheThreshold_OnlyOnce()
    {
        var large = await AddPayment(100000m);
        await AddPayment(99999.99m);
        await AddPayment(250000m, status: "PendingVerification");

        var first = await _anomalies.ScanAsync();
        var second = await _anomalies.ScanAsync();

        var flag = Assert.Single(first);
        Assert.Equal("HighAmount", flag.AnomalyType);
        Assert.Equal(large.Id, flag.PaymentId);
        Assert.Empty(second);
        Assert.Single(await _db.AnomalyFlags.ToListAsync());
    }

    [Fact]
    public async Task Scan_FlagsARefundAskedForWithinTenMinutesOfPaying()
    {
        var paidAt = DateTime.UtcNow.AddHours(-2);
        var rapid = await AddPayment(1000m, paidDate: paidAt);
        var normal = await AddPayment(1000m, paidDate: paidAt);
        _db.RefundRequests.AddRange(
            new RefundRequest { PaymentId = rapid.Id, RequestedDate = paidAt.AddMinutes(5), Reason = "x", RequestedByEmail = "a" },
            new RefundRequest { PaymentId = normal.Id, RequestedDate = paidAt.AddHours(1), Reason = "y", RequestedByEmail = "b" });
        await _db.SaveChangesAsync();

        var flags = await _anomalies.ScanAsync();

        var flag = Assert.Single(flags);
        Assert.Equal("RapidRefund", flag.AnomalyType);
        Assert.Equal(rapid.Id, flag.PaymentId);
        Assert.Empty(await _anomalies.ScanAsync());
    }

    [Fact]
    public async Task OpenFlags_LeaveOutResolvedOnes()
    {
        _db.AnomalyFlags.AddRange(
            new AnomalyFlag { AnomalyType = "HighAmount", Status = "Open" },
            new AnomalyFlag { AnomalyType = "HighAmount", Status = "Dismissed" });
        await _db.SaveChangesAsync();

        Assert.Single(await _anomalies.GetOpenFlagsAsync());
    }

    [Fact]
    public async Task Resolve_RecordsTheReviewer()
    {
        var flag = new AnomalyFlag { AnomalyType = "HighAmount" };
        _db.AnomalyFlags.Add(flag);
        await _db.SaveChangesAsync();

        var resolved = await _anomalies.ResolveFlagAsync(flag.Id, "Reviewed", "auditor@gov.lk");

        Assert.Equal("Reviewed", resolved.Status);
        Assert.Equal("auditor@gov.lk", resolved.ReviewedByEmail);
        Assert.NotNull(resolved.ReviewedDate);
        await Assert.ThrowsAsync<KeyNotFoundException>(() => _anomalies.ResolveFlagAsync(404, "Reviewed", "a"));
    }
}
