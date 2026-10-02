using System.Reflection;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Routing;

namespace Government_Service_Navigator.Backend.Tests.Security;

/// <summary>One HTTP endpoint and the auth that actually applies to it, worked out from its attributes.</summary>
internal sealed record EndpointAuth(string Controller, string Action, string Verbs, string Tier, string[] Roles)
{
    public string Key => $"{Controller}.{Action}";

    public static IReadOnlyList<EndpointAuth> All { get; } = Discover();

    private static List<EndpointAuth> Discover()
    {
        var assembly = typeof(Government_Service_Navigator.Backend.Data.Context.AppDbContext).Assembly;
        var endpoints = new List<EndpointAuth>();

        foreach (var controller in assembly.GetTypes().Where(t => !t.IsAbstract && typeof(ControllerBase).IsAssignableFrom(t)))
        {
            var controllerAuth = controller.GetCustomAttributes<AuthorizeAttribute>(true).ToList();
            var controllerAnon = controller.GetCustomAttribute<AllowAnonymousAttribute>(true) != null;

            foreach (var method in controller.GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly))
            {
                var verbs = method.GetCustomAttributes<HttpMethodAttribute>(true).SelectMany(a => a.HttpMethods).Distinct().ToList();
                if (verbs.Count == 0) continue;

                var actionAuth = method.GetCustomAttributes<AuthorizeAttribute>(true).ToList();
                var actionAnon = method.GetCustomAttribute<AllowAnonymousAttribute>(true) != null;
                var all = controllerAuth.Concat(actionAuth).ToList();
                var roles = all
                    .Where(a => !string.IsNullOrWhiteSpace(a.Roles))
                    .SelectMany(a => a.Roles!.Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries))
                    .Distinct()
                    .OrderBy(r => r)
                    .ToArray();

                string tier;
                if (actionAnon || (controllerAnon && actionAuth.Count == 0)) tier = "None";
                else if (roles.Length > 0) tier = "Role";
                else if (all.Count > 0) tier = "AnyToken";
                else tier = "None";

                endpoints.Add(new EndpointAuth(
                    controller.Name.Replace("Controller", ""),
                    method.Name,
                    string.Join("/", verbs),
                    tier,
                    tier == "Role" ? roles : Array.Empty<string>()));
            }
        }

        return endpoints.OrderBy(e => e.Key).ToList();
    }
}
