using Government_Service_Navigator.Backend.Data.Context;
using Government_Service_Navigator.Backend.Models.Entities;
using Government_Service_Navigator.Backend.Services;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace Government_Service_Navigator.Backend.Tests.Services;

/// <summary>Usage analytics by day, week, month and year, approval likelihood, and saved report snapshots.</summary>
public class AnalyticsServiceTests
{
    private readonly AppDbContext _db = TestDb.Create();
    private readonly AnalyticsService _analytics;

    public AnalyticsServiceTests() => _analytics = new AnalyticsService(_db);

    private static DateTime Day(int year, int month, int day) => new(year, month, day, 0, 0, 0, DateTimeKind.Utc);

    private async Task AddStat(DateTime date, int total, int approved, int rejected, double hours = 24, int serviceId = 1)
    {
        _db.ServiceUsageStats.Add(new ServiceUsageStat
        {
            ServiceProcedureId = serviceId,
            Date = date,
            TotalApplications = total,
            ApprovedCount = approved,
            RejectedCount = rejected,
            AverageProcessingHours = hours
        });
        await _db.SaveChangesAsync();
    }

    // ---- Usage aggregates ----

    [Fact]
    public async Task Daily_CountsOnlyThatDay_AndAveragesTheProcessingTime()
    {
        await AddStat(Day(2026, 3, 10).AddHours(9), 10, 6, 2, hours: 10);
        await AddStat(Day(2026, 3, 10).AddHours(15), 5, 3, 1, hours: 20.555);
        await AddStat(Day(2026, 3, 11), 99, 99, 0);

        var day = await _analytics.GetDailyAsync(Day(2026, 3, 10).AddHours(13));

        Assert.Equal("2026-03-10", day.Period);
        Assert.Equal(15, day.TotalApplications);
        Assert.Equal(9, day.ApprovedCount);
        Assert.Equal(3, day.RejectedCount);
        Assert.Equal(15.28, day.AverageProcessingHours);
    }

    [Fact]
    public async Task Weekly_CoversSevenDaysFromTheStart()
    {
        await AddStat(Day(2026, 3, 2), 1, 1, 0);
        await AddStat(Day(2026, 3, 8), 2, 1, 1);
        await AddStat(Day(2026, 3, 9), 50, 0, 0);

        var week = await _analytics.GetWeeklyAsync(Day(2026, 3, 2));

        Assert.Equal("Week of 2026-03-02", week.Period);
        Assert.Equal(3, week.TotalApplications);
    }

    [Fact]
    public async Task MonthlyAndYearly()
    {
        await AddStat(Day(2026, 2, 28), 4, 2, 2);
        await AddStat(Day(2026, 3, 1), 6, 5, 1);
        await AddStat(Day(2027, 1, 1), 100, 0, 0);

        var march = await _analytics.GetMonthlyAsync(2026, 3);
        var year = await _analytics.GetYearlyAsync(2026);

        Assert.Equal("2026-03", march.Period);
        Assert.Equal(6, march.TotalApplications);
        Assert.Equal("2026", year.Period);
        Assert.Equal(10, year.TotalApplications);
    }

    [Fact]
    public async Task EmptyPeriod_IsAllZero()
    {
        var day = await _analytics.GetDailyAsync(Day(2026, 1, 1));

        Assert.Equal(0, day.TotalApplications);
        Assert.Equal(0, day.AverageProcessingHours);
    }

    // ---- Approval likelihood ----

    [Fact]
    public async Task ApprovalLikelihood_IsTheShareOfDecidedApplicationsApproved()
    {
        await AddStat(Day(2026, 1, 1), 10, 7, 1, serviceId: 5);
        await AddStat(Day(2026, 1, 2), 10, 2, 2, serviceId: 5);
        await AddStat(Day(2026, 1, 2), 10, 0, 9, serviceId: 6);

        var result = await _analytics.GetApprovalLikelihoodAsync(5);

        Assert.Equal(75.0, result.ApprovalLikelihoodPercent);
        Assert.Equal(12, result.SampleSize);
    }

    [Fact]
    public async Task ApprovalLikelihood_WithNoHistory_IsANeutralFiftyPercent()
    {
        var result = await _analytics.GetApprovalLikelihoodAsync(5);

        Assert.Equal(50.0, result.ApprovalLikelihoodPercent);
        Assert.Equal(0, result.SampleSize);
    }

    // ---- Report snapshots ----

    [Fact]
    public async Task Snapshots_SaveListNewestFirstAndDelete()
    {
        var first = await _analytics.SaveSnapshotAsync("January", "Monthly", "{\"total\":10}", "finance@gov.lk");
        first.GeneratedDate = DateTime.UtcNow.AddDays(-1);
        await _db.SaveChangesAsync();
        var second = await _analytics.SaveSnapshotAsync("February", "Monthly", "{\"total\":12}", "finance@gov.lk");

        Assert.Equal(new[] { second.Id, first.Id }, (await _analytics.ListSnapshotsAsync()).Select(s => s.Id));
        Assert.Equal("{\"total\":12}", second.DataJson);
        Assert.Equal("finance@gov.lk", second.GeneratedByEmail);

        await _analytics.DeleteSnapshotAsync(first.Id);

        Assert.Single(await _db.ReportSnapshots.ToListAsync());
        await Assert.ThrowsAsync<KeyNotFoundException>(() => _analytics.DeleteSnapshotAsync(first.Id));
    }
}
