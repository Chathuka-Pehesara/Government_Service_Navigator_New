using Government_Service_Navigator.Backend.Controllers;
using Government_Service_Navigator.Backend.Data.Context;
using Government_Service_Navigator.Backend.Models.Entities;
using Microsoft.AspNetCore.Mvc;
using Xunit;

namespace Government_Service_Navigator.Backend.Tests.Controllers;

/// <summary>The audit-log query endpoints: by application, id, performer and action, and the paged recent feed.</summary>
public class AuditLogsControllerTests
{
    private readonly AppDbContext _db = TestDb.Create();
    private readonly AuditLogsController _controller;

    public AuditLogsControllerTests()
    {
        _controller = new AuditLogsController(_db);
        var now = DateTime.UtcNow;
        _db.AuditLogs.AddRange(
            Log(1, "PaymentVerified", "finance@gov.lk", now.AddMinutes(-3)),
            Log(1, "RefundApproved", "finance@gov.lk", now.AddMinutes(-1)),
            Log(2, "PaymentVerified", "other@gov.lk", now.AddMinutes(-2)));
        _db.SaveChanges();
    }

    private static AuditLog Log(int applicationId, string action, string by, DateTime at) =>
        new() { ApplicationId = applicationId, Action = action, PerformedBy = by, Timestamp = at, OldValues = "", NewValues = "" };

    private static List<AuditLog> Logs(IActionResult result) =>
        Assert.IsAssignableFrom<IEnumerable<AuditLog>>(Assert.IsType<OkObjectResult>(result).Value).ToList();

    [Fact]
    public async Task ByApplication_NewestFirst()
    {
        var logs = Logs(await _controller.GetByApplication(1));

        Assert.Equal(new[] { "RefundApproved", "PaymentVerified" }, logs.Select(l => l.Action));
    }

    [Fact]
    public async Task ById_KnownAndUnknown()
    {
        var id = _db.AuditLogs.First().Id;

        Assert.IsType<OkObjectResult>(await _controller.GetById(id));
        Assert.IsType<NotFoundObjectResult>(await _controller.GetById(404));
    }

    [Fact]
    public async Task ByPerformer_NeedsAnEmail()
    {
        Assert.Equal(2, Logs(await _controller.GetByPerformer("finance@gov.lk")).Count);
        Assert.IsType<BadRequestObjectResult>(await _controller.GetByPerformer(" "));
    }

    [Fact]
    public async Task ByAction_NeedsAnAction()
    {
        Assert.Equal(new[] { 2, 1 }, Logs(await _controller.GetByAction("PaymentVerified")).Select(l => l.ApplicationId));
        Assert.IsType<BadRequestObjectResult>(await _controller.GetByAction(""));
    }

    [Fact]
    public async Task Recent_PagesNewestFirst()
    {
        var body = TestJson.Body(await _controller.GetRecent(page: 2, pageSize: 2));

        Assert.Equal(3, body.GetProperty("TotalCount").GetInt32());
        Assert.Equal(2, body.GetProperty("TotalPages").GetInt32());
        Assert.Equal("PaymentVerified", Assert.Single(body.GetProperty("Items").EnumerateArray()).GetProperty("Action").GetString());
    }

    [Theory]
    [InlineData(0, 0, 1, 20)]
    [InlineData(-5, 500, 1, 20)]
    public async Task Recent_OutOfRangePaging_UsesTheDefaults(int page, int pageSize, int expectedPage, int expectedSize)
    {
        var body = TestJson.Body(await _controller.GetRecent(page, pageSize));

        Assert.Equal(expectedPage, body.GetProperty("Page").GetInt32());
        Assert.Equal(expectedSize, body.GetProperty("PageSize").GetInt32());
    }
}
