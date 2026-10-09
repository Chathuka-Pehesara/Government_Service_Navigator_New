using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Government_Service_Navigator.Backend.Services.Interfaces;
using Government_Service_Navigator.Backend.Models.Entities;
using Government_Service_Navigator.Backend.DTOs;
using Government_Service_Navigator.Backend.Data.Context;
using Government_Service_Navigator.Backend.Services;
using Government_Service_Navigator.Backend.Validation;
using Microsoft.Extensions.Caching.Hybrid;

namespace Government_Service_Navigator.Backend.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class ServicesController : ControllerBase
    {
        private readonly IServiceCatalogService _catalogService;
        private readonly AppDbContext _context;
        private readonly HybridCache _cache;

        public ServicesController(IServiceCatalogService catalogService, AppDbContext context, HybridCache cache)
        {
            _catalogService = catalogService;
            _context = context;
            _cache = cache;
        }

        // Admin adds a new service/procedure
        [HttpPost]
        public async Task<IActionResult> CreateService([FromBody] ServiceProcedure service)
        {
            // Custom Validation: Name cannot be empty and must contain letters
            if (string.IsNullOrWhiteSpace(service.Name))
                return BadRequest(new { message = "Procedure Name cannot be empty." });
            if (!Regex.IsMatch(service.Name, "[a-zA-Z]"))
                return BadRequest(new { message = "Procedure Name must contain at least one letter and cannot be only numbers." });

            var problems = ServiceCatalogValidator.Service(service);
            if (problems.Count > 0) return BadRequest(ValidationError.Body(problems));

            try
            {
                var createdService = await _catalogService.CreateServiceAsync(service);
                return CreatedAtAction(nameof(GetService), new { id = createdService.Id }, createdService);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = ex.Message, inner = ex.InnerException?.Message });
            }
        }


        // Fetch procedure details + document checklist
        [HttpGet("{id}")]
        // Catalog reads are cached; any catalog write clears the "catalog" tag (CitizenChangeInterceptor)
        public async Task<IActionResult> GetService(int id)
        {
            var service = await _cache.GetOrCreateAsync(
                CacheKeys.Service(id),
                async _ => await _catalogService.GetServiceByIdAsync(id),
                tags: new[] { CacheKeys.CatalogTag });
            if (service == null) return NotFound();
            return Ok(service);
        }

        // List all services for the Catalog Manager UI
        [HttpGet]
        public async Task<IActionResult> GetAllServices()
        {
            var services = await _cache.GetOrCreateAsync(
                CacheKeys.AllServices,
                async _ => (await _catalogService.GetAllServicesAsync()).ToList(),
                tags: new[] { CacheKeys.CatalogTag });
            return Ok(services);
        }

        // Update eligibility criteria for a service
        [HttpPut("{id}/eligibility-rules")]
        public async Task<IActionResult> UpdateEligibilityRules(int id, [FromBody] List<EligibilityRule> rules)
        {
            var problems = ServiceCatalogValidator.EligibilityRules(rules);
            if (problems.Count > 0) return BadRequest(ValidationError.Body(problems));

            try
            {
                var updatedService = await _catalogService.UpdateEligibilityRulesAsync(id, rules);
                return Ok(updatedService);
            }
            catch (KeyNotFoundException)
            {
                return NotFound("Service procedure not found.");
            }
        }

        // Retire/deactivate a procedure
        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteService(int id)
        {
            var success = await _catalogService.RetireServiceAsync(id);
            if (!success) return NotFound();
            return NoContent();
        }

        // Update basic details of an existing service
        [HttpPut("{id}")]
        public async Task<IActionResult> UpdateService(int id, [FromBody] ServiceProcedure updatedService)
        {
            // Custom Validation: Name cannot be empty and must contain letters
            if (string.IsNullOrWhiteSpace(updatedService.Name))
                return BadRequest(new { message = "Procedure Name cannot be empty." });
            if (!Regex.IsMatch(updatedService.Name, "[a-zA-Z]"))
                return BadRequest(new { message = "Procedure Name must contain at least one letter and cannot be only numbers." });

            var problems = ServiceCatalogValidator.Service(updatedService);
            if (problems.Count > 0) return BadRequest(ValidationError.Body(problems));

            var service = await _catalogService.UpdateServiceAsync(id, updatedService);
            if (service == null) return NotFound("Service procedure not found.");

            return Ok(service);
        }

        // Scores a citizen profile against a service's rules; returns match % + missing criteria
        [HttpPost("eligibility-score")]
        public async Task<IActionResult> CalculateEligibilityScore([FromBody] EligibilityRequestDto request)
        {
            try
            {
                var result = await _catalogService.CalculateEligibilityScoreAsync(request.ServiceId, request.CitizenProfile);
                return Ok(result);
            }
            catch (KeyNotFoundException)
            {
                return NotFound("Service procedure not found.");
            }
        }

        // Update document requirements for a service
        [HttpPut("{id}/documents")]
        public async Task<IActionResult> UpdateDocumentRequirements(int id, [FromBody] List<DocumentRequirement> documents)
        {
            // Custom Validation: Check for empty fields and valid names
            if (documents.Any(d => string.IsNullOrWhiteSpace(d.DocumentName) || string.IsNullOrWhiteSpace(d.Description)))
                return BadRequest(new { message = "Document Name and Description cannot be empty." });
            if (documents.Any(d => !Regex.IsMatch(d.DocumentName, "[a-zA-Z]")))
                return BadRequest(new { message = "Document Type Name must contain at least one letter." });

            var problems = ServiceCatalogValidator.Documents(documents);
            if (problems.Count > 0) return BadRequest(ValidationError.Body(problems));

            try
            {
                var updatedService = await _catalogService.UpdateDocumentRequirementsAsync(id, documents);
                return Ok(updatedService);
            }
            catch (KeyNotFoundException)
            {
                return NotFound("Service procedure not found.");
            }
        }

        // Delete a specific document requirement by its ID
        [HttpDelete("documents/{documentId}")]
        public async Task<IActionResult> DeleteDocumentRequirement(int documentId)
        {
            var success = await _catalogService.DeleteDocumentRequirementAsync(documentId);
            if (!success) return NotFound("Document requirement not found.");

            return NoContent();
        }

        [HttpPut("{id}/fees")]
        public async Task<IActionResult> UpdateFeeSchedules(int id, [FromBody] List<FeeSchedule> fees)
        {
            // Custom Validation: Check for empty fields and valid fee types
            if (fees.Any(f => string.IsNullOrWhiteSpace(f.FeeType)))
                return BadRequest(new { message = "Fee Type cannot be empty." });
            if (fees.Any(f => !Regex.IsMatch(f.FeeType, "[a-zA-Z]")))
                return BadRequest(new { message = "Fee Type must contain at least one letter." });

            var problems = ServiceCatalogValidator.Fees(fees);
            if (problems.Count > 0) return BadRequest(ValidationError.Body(problems));

            try
            {
                var updatedService = await _catalogService.UpdateFeeSchedulesAsync(id, fees);
                return Ok(updatedService);
            }
            catch (KeyNotFoundException)
            {
                return NotFound("Service procedure not found.");
            }
        }

        [HttpDelete("fees/{feeId}")]
        public async Task<IActionResult> DeleteFeeSchedule(int feeId)
        {
            var success = await _catalogService.DeleteFeeScheduleAsync(feeId);
            if (!success) return NotFound("Fee schedule not found.");
            return NoContent();
        }

        // Fetch stage-specific documents, fees, and department for a procedure
        [HttpGet("{id}/stage/{stageNumber:int}")]
        public async Task<IActionResult> GetServiceStageDetails(int id, int stageNumber)
        {
            var service = await _catalogService.GetServiceByIdAsync(id);
            if (service == null) return NotFound("Service not found.");

            var template = await _context.Templates
                .Include(t => t.Fields)
                .Where(t => t.ServiceProcedureId == id && t.StageOrder == stageNumber && t.Status == "Active")
                .OrderByDescending(t => t.CreatedAt)
                .FirstOrDefaultAsync();

            var stageDocs = new List<object>();
            var stageFees = new List<object>();

            if (template != null)
            {
                var fileFields = template.Fields
                    .Where(f => f.Type == "file" || f.Type == "document" || f.Type == "documentUpload")
                    .OrderBy(f => f.OrderIndex)
                    .ToList();

                foreach (var f in fileFields)
                {
                    var catDoc = service.DocumentRequirements
                        .FirstOrDefault(d => string.Equals(d.DocumentName.Trim(), f.Label.Trim(), StringComparison.OrdinalIgnoreCase) ||
                                             d.DocumentName.Contains(f.Label, StringComparison.OrdinalIgnoreCase) ||
                                             f.Label.Contains(d.DocumentName, StringComparison.OrdinalIgnoreCase) ||
                                             (f.Label.Contains("birth", StringComparison.OrdinalIgnoreCase) && d.DocumentName.Contains("birth", StringComparison.OrdinalIgnoreCase)) ||
                                             (f.Label.Contains("nic", StringComparison.OrdinalIgnoreCase) && d.DocumentName.Contains("nic", StringComparison.OrdinalIgnoreCase)) ||
                                             (f.Label.Contains("photo", StringComparison.OrdinalIgnoreCase) && d.DocumentName.Contains("image", StringComparison.OrdinalIgnoreCase)) ||
                                             (f.Label.Contains("image", StringComparison.OrdinalIgnoreCase) && d.DocumentName.Contains("image", StringComparison.OrdinalIgnoreCase)));

                    stageDocs.Add(new
                    {
                        id = catDoc?.Id ?? 0,
                        serviceProcedureId = id,
                        documentName = catDoc?.DocumentName ?? f.Label,
                        description = catDoc?.Description ?? "",
                        isMandatory = catDoc?.IsMandatory ?? f.IsRequired
                    });
                }

                var paymentField = template.Fields.FirstOrDefault(f => f.Type == "payment");
                if (paymentField != null && !string.IsNullOrWhiteSpace(paymentField.Options))
                {
                    try
                    {
                        using var pDoc = JsonDocument.Parse(paymentField.Options);
                        if (pDoc.RootElement.TryGetProperty("amount", out var amt) && amt.GetDecimal() > 0)
                        {
                            var stageAmt = amt.GetDecimal();
                            string feeName = pDoc.RootElement.TryGetProperty("feeType", out var ft) && ft.GetString() is string s && !string.IsNullOrWhiteSpace(s)
                                ? s
                                : paymentField.Label;

                            stageFees.Add(new
                            {
                                id = 0,
                                serviceProcedureId = id,
                                feeType = feeName,
                                amount = stageAmt,
                                effectiveDate = DateTime.UtcNow
                            });
                        }
                    }
                    catch { }
                }
            }
            else if (stageNumber == 1)
            {
                // Fall back to catalog docs and fees for single-stage procedures
                stageDocs.AddRange(service.DocumentRequirements.Select(d => new
                {
                    id = d.Id,
                    serviceProcedureId = id,
                    documentName = d.DocumentName,
                    description = d.Description ?? "",
                    isMandatory = d.IsMandatory
                }));

                stageFees.AddRange(service.FeeSchedules.Select(f => new
                {
                    id = f.Id,
                    serviceProcedureId = id,
                    feeType = f.FeeType,
                    amount = f.Amount,
                    effectiveDate = f.EffectiveDate
                }));
            }

            return Ok(new
            {
                serviceId = service.Id,
                serviceCode = service.ServiceId,
                serviceName = service.Name,
                stageNumber,
                stageDepartment = template?.Department,
                stageDescription = template?.StageDescription,
                documentRequirements = stageDocs,
                feeSchedules = stageFees
            });
        }

        // Configure multi-department stages and workflow for a service
        [HttpPut("{id}/workflow")]
        public async Task<IActionResult> UpdateWorkflow(int id, [FromBody] UpdateWorkflowRequest request)
        {
            var problems = ServiceCatalogValidator.Workflow(request.TotalStages, request.WorkflowDepartments);
            if (problems.Count > 0) return BadRequest(ValidationError.Body(problems));

            var updated = await _catalogService.UpdateWorkflowAsync(id, request.TotalStages, request.WorkflowDepartments);
            if (updated == null) return NotFound("Service procedure not found.");
            return Ok(updated);
        }
    }

    public class UpdateWorkflowRequest
    {
        public int TotalStages { get; set; } = 1;
        public List<string> WorkflowDepartments { get; set; } = new();
    }
}
