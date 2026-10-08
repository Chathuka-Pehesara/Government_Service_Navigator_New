using System.Security.Claims;
using System.Text.Json;
using Government_Service_Navigator.Backend.Data.Context;
using Government_Service_Navigator.Backend.DTOs.Responses;
using Government_Service_Navigator.Backend.Models.Entities;
using Government_Service_Navigator.Backend.Services.Interfaces;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Caching.Hybrid;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

// The agent duplicate registry is static, so tests that submit applications must not run in parallel
[assembly: CollectionBehavior(DisableTestParallelization = true)]

namespace Government_Service_Navigator.Backend.Tests;

internal static class TestDb
{
    /// <summary>
    /// A fresh in-memory database per call. The in-memory provider has no transactions, so the
    /// "transaction ignored" warning (which EF raises as an error by default) is switched off.
    /// </summary>
    public static AppDbContext Create() =>
        new(new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase($"backend-tests-{Guid.NewGuid()}")
            .ConfigureWarnings(w => w.Ignore(InMemoryEventId.TransactionIgnoredWarning))
            .Options);
}

internal static class TestUsers
{
    public const string CitizenNic = "200012345678";
    public const string CitizenEmail = "citizen@example.lk";

    public static ClaimsPrincipal Citizen(string nic = CitizenNic, string email = CitizenEmail) =>
        new(new ClaimsIdentity(new[]
        {
            new Claim("nicNumber", nic),
            new Claim(ClaimTypes.Email, email),
            new Claim(ClaimTypes.Role, "User"),
        }, "Test"));

    /// <summary>A staff user. The department claim is what limits an officer's queue and task access.</summary>
    public static ClaimsPrincipal Officer(string? department, string role = "Verifying Officer", string email = "officer@gov.lk")
    {
        var claims = new List<Claim> { new(ClaimTypes.Email, email), new(ClaimTypes.Role, role) };
        if (department != null) claims.Add(new Claim("department", department));
        return new(new ClaimsIdentity(claims, "Test"));
    }

    public static ClaimsPrincipal Anonymous() => new(new ClaimsIdentity());

    public static T WithUser<T>(this T controller, ClaimsPrincipal user) where T : ControllerBase
    {
        controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext { User = user }
        };
        return controller;
    }
}

internal static class TestCache
{
    /// <summary>An in-memory HybridCache with no Redis, as Program.cs builds it when Redis is not configured.</summary>
    public static HybridCache Create() =>
        new ServiceCollection().AddHybridCache().Services.BuildServiceProvider().GetRequiredService<HybridCache>();
}

internal static class TestJson
{
    /// <summary>The body of an ObjectResult as JSON, so anonymous response objects can be inspected.</summary>
    public static JsonElement Body(IActionResult result) => result switch
    {
        ObjectResult o => JsonSerializer.SerializeToElement(o.Value),
        _ => throw new Xunit.Sdk.XunitException($"Expected an object result, got {result.GetType().Name}")
    };

    public static int? Status(IActionResult result) => result switch
    {
        ObjectResult o => o.StatusCode,
        StatusCodeResult s => s.StatusCode,
        _ => null
    };
}

/// <summary>Records every notification instead of sending email.</summary>
internal sealed class RecordingNotifications : INotificationService
{
    public List<string> Sent { get; } = new();

    public Task SendEmailAsync(string toEmail, string subject, string body, string? htmlBody = null) => Record($"Email:{toEmail}:{subject}");
    public Task NotifyRefundStatusAsync(string toEmail, int refundId, string status, string? note) => Record($"RefundStatus:{toEmail}:{status}");
    public Task NotifyRefundRequestedAsync(string toEmail, RefundRequest refund) => Record($"RefundRequested:{toEmail}");
    public Task NotifyRefundRejectedAsync(string toEmail, RefundRequest refund) => Record($"RefundRejected:{toEmail}");
    public Task NotifyRefundCompletedAsync(string toEmail, RefundRequest refund) => Record($"RefundCompleted:{toEmail}");
    public Task NotifyPaymentStatusAsync(string toEmail, int paymentId, string status) => Record($"PaymentStatus:{toEmail}:{status}");
    public Task NotifyOnlinePaymentSuccessAsync(string toEmail, OnlinePaymentReceiptDto receipt) => Record($"OnlinePayment:{toEmail}");

    private Task Record(string entry)
    {
        Sent.Add(entry);
        return Task.CompletedTask;
    }
}
