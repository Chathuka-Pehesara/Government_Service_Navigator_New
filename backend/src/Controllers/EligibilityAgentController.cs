using System.Collections.Generic;
using System.Threading.Tasks;
using Government_Service_Navigator.AgenticAi.Agents.EligibilityDocumentAgent;
using Government_Service_Navigator.AgenticAi.Agents.EligibilityDocumentAgent.DTOs;
using Government_Service_Navigator.AgenticAi.Orchestration;
using Government_Service_Navigator.AgenticAi.State;
using DA = System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Mvc;

namespace Government_Service_Navigator.Backend.Controllers;

[ApiController]
[Route("api/[controller]")]
public class EligibilityAgentController : ControllerBase
{
    private readonly IEligibilityDocumentAgent _eligibilityAgent;

    public EligibilityAgentController(IEligibilityDocumentAgent eligibilityAgent)
    {
        _eligibilityAgent = eligibilityAgent;
    }

    /// <summary>
    /// Evaluates citizen eligibility and missing document checklist using the rules tool and the Vector DB service catalog
    /// </summary>
    [HttpPost("evaluate")]
    public async Task<IActionResult> EvaluateEligibility([FromBody] EligibilityAgentQueryDto query)
    {
        if (string.IsNullOrWhiteSpace(query.ServiceName))
            return BadRequest("ServiceName is required.");

        var profile = new CitizenProfile
        {
            Age = query.Age > 0 ? query.Age : 25,
            CitizenshipStatus = string.IsNullOrWhiteSpace(query.CitizenshipStatus) ? "Sri Lankan" : query.CitizenshipStatus,
            AnnualIncome = query.AnnualIncome,
            EmploymentStatus = string.IsNullOrWhiteSpace(query.EmploymentStatus) ? "Employed" : query.EmploymentStatus,
            ProvidedDocuments = query.ProvidedDocuments ?? new List<string>()
        };

        var request = new EligibilityPlanRequest(
            ServiceName: query.ServiceName,
            ServiceId: query.ServiceId,
            Profile: profile,
            PlanSummary: query.PlanSummary,
            Stage: query.Stage
        );

        try
        {
            var response = await _eligibilityAgent.EvaluateEligibilityAsync(request);
            return Ok(response);
        }
        catch (System.Exception ex)
        {
            return StatusCode(500, new { message = "Eligibility evaluation failed", details = ex.Message });
        }
    }

    /// <summary>
    /// Executes Agent 2 stage in the Workflow Orchestrator pipeline and returns state
    /// </summary>
    [HttpPost("orchestrate")]
    public async Task<IActionResult> OrchestrateEligibility([FromBody] EligibilityAgentQueryDto query)
    {
        var profile = new CitizenProfile
        {
            Age = query.Age > 0 ? query.Age : 25,
            CitizenshipStatus = string.IsNullOrWhiteSpace(query.CitizenshipStatus) ? "Sri Lankan" : query.CitizenshipStatus,
            AnnualIncome = query.AnnualIncome,
            EmploymentStatus = string.IsNullOrWhiteSpace(query.EmploymentStatus) ? "Employed" : query.EmploymentStatus,
            ProvidedDocuments = query.ProvidedDocuments ?? new List<string>()
        };

        var request = new EligibilityPlanRequest(
            ServiceName: query.ServiceName ?? "General Government Service",
            ServiceId: query.ServiceId,
            Profile: profile,
            PlanSummary: query.PlanSummary
        );

        var state = WorkflowExecutionState.Create(
            applicationId: query.ApplicationId > 0 ? query.ApplicationId : 1001,
            citizenNic: query.CitizenNic ?? "199512345678",
            serviceName: request.ServiceName
        );

        state.CurrentStage = "EligibilityAndDocumentAnalysis";
        state.UpdatedAt = DateTime.UtcNow;

        var result = await _eligibilityAgent.EvaluateEligibilityAsync(request);
        state.EligibilityResult = result;

        if (result.IsEligible)
        {
            state.CurrentStage = "DraftingPreFill";
        }
        else
        {
            state.CurrentStage = "IneligibleRequirementGap";
        }

        state.UpdatedAt = DateTime.UtcNow;
        return Ok(state);
    }
}

public class EligibilityAgentQueryDto
{
    [DA.MaxLength(200, ErrorMessage = "Service name must be at most 200 characters.")]
    public string ServiceName { get; set; } = string.Empty;
    public int? ServiceId { get; set; }
    [DA.Range(0, 120, ErrorMessage = "Age must be between 0 and 120.")]
    public int Age { get; set; } = 25;
    [DA.MaxLength(50, ErrorMessage = "Citizenship status must be at most 50 characters.")]
    public string CitizenshipStatus { get; set; } = "Sri Lankan";
    [DA.Range(0, 1_000_000_000, ErrorMessage = "Annual income cannot be negative.")]
    public decimal AnnualIncome { get; set; } = 0;
    [DA.MaxLength(50, ErrorMessage = "Employment status must be at most 50 characters.")]
    public string EmploymentStatus { get; set; } = "Employed";
    [DA.MaxLength(100, ErrorMessage = "At most 100 documents can be listed.")]
    public List<string>? ProvidedDocuments { get; set; } = new();
    [DA.MaxLength(5000, ErrorMessage = "Plan summary must be at most 5000 characters.")]
    public string? PlanSummary { get; set; }
    public int ApplicationId { get; set; }
    public string? CitizenNic { get; set; }
    public int? Stage { get; set; }
}
