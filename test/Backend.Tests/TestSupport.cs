using System.Security.Claims;
using Government_Service_Navigator.Backend.Data.Context;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
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
