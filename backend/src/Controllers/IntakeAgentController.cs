using AgenticAi.Agents.IntakePlanningAgent;
using DA = System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Mvc;

using Government_Service_Navigator.Backend.Data.Context;
using Microsoft.EntityFrameworkCore;

namespace Government_Service_Navigator.Backend.Controllers;

[ApiController]
[Route("api/[controller]")]
public class IntakeAgentController : ControllerBase
{
    private readonly IIntakePlanningAgent _agent;
    private readonly AppDbContext _appDb;

    public IntakeAgentController(IIntakePlanningAgent agent, AppDbContext appDb)
    {
        _agent = agent;
        _appDb = appDb;
    }

    [HttpPost("ask")]
    public async Task<IActionResult> AskAgent([FromBody] UserQueryDto query)
    {
        if (string.IsNullOrWhiteSpace(query.Text))
            return BadRequest("Text is required.");

        // 1. Create the request for the agent
        var request = new IntakePlanRequest(query.Text);

        // 2. The agent will embed the text locally and match it against the Neon vector DB
        var response = await _agent.GeneratePlanAsync(request);

        // 3. Fallback / Catalog Normalization: If a service was matched, enrich with official database requirements
        if (response.RecommendedService != "Service Not Found")
        {
            var services = await _appDb.ServiceProcedures
                .Include(s => s.DocumentRequirements)
                .ToListAsync();

            var cleanServiceName = response.RecommendedService;
            if (cleanServiceName.Contains(" - "))
            {
                cleanServiceName = cleanServiceName.Split(new[] { " - " }, StringSplitOptions.None)[0].Trim();
            }

            var matchedService = services.FirstOrDefault(s =>
                string.Equals(s.Name, cleanServiceName, StringComparison.OrdinalIgnoreCase) ||
                string.Equals(s.Name, response.RecommendedService, StringComparison.OrdinalIgnoreCase) ||
                response.RecommendedService.Contains(s.Name, StringComparison.OrdinalIgnoreCase) ||
                cleanServiceName.Contains(s.Name, StringComparison.OrdinalIgnoreCase) ||
                s.Name.Contains(cleanServiceName, StringComparison.OrdinalIgnoreCase));

            if (matchedService != null)
            {
                var officialDocs = matchedService.DocumentRequirements?
                    .Select(d => d.DocumentName)
                    .Where(n => !string.IsNullOrWhiteSpace(n))
                    .ToList() ?? new List<string>();

                var finalDocs = response.RequiredDocuments != null && response.RequiredDocuments.Count > 0
                    ? response.RequiredDocuments.Union(officialDocs, StringComparer.OrdinalIgnoreCase).ToList()
                    : officialDocs;

                response = response with
                {
                    RecommendedService = matchedService.Name,
                    RequiredDocuments = finalDocs
                };
            }
        }

        // 4. Return the AI-generated plan and the context it used
        return Ok(response);
    }
}

// A simple DTO to catch the incoming JSON request
public class UserQueryDto
{
    [DA.Required(ErrorMessage = "Describe what you need help with.")]
    [DA.StringLength(1000, MinimumLength = 2, ErrorMessage = "Your question must be 2-1000 characters.")]
    public string Text { get; set; } = string.Empty;
}
