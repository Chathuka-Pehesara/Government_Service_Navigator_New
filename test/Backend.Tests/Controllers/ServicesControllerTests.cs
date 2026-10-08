using Government_Service_Navigator.Backend.Controllers;
using Government_Service_Navigator.Backend.Data.Context;
using Government_Service_Navigator.Backend.Models.Entities;
using Government_Service_Navigator.Backend.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace Government_Service_Navigator.Backend.Tests.Controllers;

/// <summary>
/// The catalog endpoints: validation happens before anything is saved, unknown ids are 404s,
/// and the stage details come from the stage's template or fall back to the catalog.
/// </summary>
public class ServicesControllerTests
{
    private readonly AppDbContext _db = TestDb.Create();
    private readonly ServicesController _controller;

    public ServicesControllerTests() =>
        _controller = new ServicesController(new ServiceCatalogService(_db), _db, TestCache.Create());

    private static ServiceProcedure NewService(string name = "Police Clearance") =>
        new() { ServiceId = "GSN-SRV-001", Name = name, Category = "Legal & Security", Status = "Active", TotalStages = 1 };

    private async Task<ServiceProcedure> AddService()
    {
        var service = NewService();
        _db.ServiceProcedures.Add(service);
        await _db.SaveChangesAsync();
        return service;
    }

    // ---- Create ----

    [Fact]
    public async Task CreateService_Valid_IsCreatedWithItsLocation()
    {
        var result = Assert.IsType<CreatedAtActionResult>(await _controller.CreateService(NewService()));

        Assert.Equal(nameof(ServicesController.GetService), result.ActionName);
        var created = Assert.IsType<ServiceProcedure>(result.Value);
        Assert.Equal(created.Id, result.RouteValues!["id"]);
        Assert.Single(await _db.ServiceProcedures.ToListAsync());
    }

    [Fact]
    public async Task CreateService_Invalid_IsBadRequest_AndSavesNothing()
    {
        var bad = NewService(name: "ab");

        Assert.IsType<BadRequestObjectResult>(await _controller.CreateService(bad));
        Assert.Empty(await _db.ServiceProcedures.ToListAsync());
    }

    // ---- Read ----

    [Fact]
    public async Task GetService_KnownAndUnknown()
    {
        var service = await AddService();

        var ok = Assert.IsType<OkObjectResult>(await _controller.GetService(service.Id));
        Assert.Equal("Police Clearance", Assert.IsType<ServiceProcedure>(ok.Value).Name);
        Assert.IsType<NotFoundResult>(await _controller.GetService(404));
    }

    [Fact]
    public async Task GetAllServices_ListsTheActiveCatalog()
    {
        await AddService();

        var ok = Assert.IsType<OkObjectResult>(await _controller.GetAllServices());

        Assert.Single(Assert.IsAssignableFrom<IEnumerable<ServiceProcedure>>(ok.Value));
    }

    // ---- Update and delete ----

    [Fact]
    public async Task UpdateService_InvalidOrUnknown()
    {
        var service = await AddService();

        Assert.IsType<BadRequestObjectResult>(await _controller.UpdateService(service.Id, NewService(name: "")));
        Assert.IsType<NotFoundObjectResult>(await _controller.UpdateService(404, NewService()));
        Assert.IsType<OkObjectResult>(await _controller.UpdateService(service.Id, NewService(name: "Police Clearance Report")));
        Assert.Equal("Police Clearance Report", (await _db.ServiceProcedures.SingleAsync()).Name);
    }

    [Fact]
    public async Task DeleteService_RetiresIt_OrIsNotFound()
    {
        var service = await AddService();

        Assert.IsType<NoContentResult>(await _controller.DeleteService(service.Id));
        Assert.Equal("Retired", (await _db.ServiceProcedures.SingleAsync()).Status);
        Assert.IsType<NotFoundResult>(await _controller.DeleteService(404));
    }

    [Fact]
    public async Task UpdateEligibilityRules_BadRuleOrUnknownService()
    {
        var service = await AddService();

        Assert.IsType<BadRequestObjectResult>(await _controller.UpdateEligibilityRules(service.Id, new() { new() { Field = "Age", Operator = "~", Value = "18" } }));
        Assert.IsType<NotFoundObjectResult>(await _controller.UpdateEligibilityRules(404, new()));
        Assert.IsType<OkObjectResult>(await _controller.UpdateEligibilityRules(service.Id, new() { new() { Field = "Age", Operator = ">=", Value = "18" } }));
        Assert.Single(await _db.EligibilityRules.ToListAsync());
    }

    [Fact]
    public async Task UpdateDocumentRequirements_RepeatedNames_AreRejected()
    {
        var service = await AddService();

        var result = await _controller.UpdateDocumentRequirements(service.Id, new()
        {
            new() { DocumentName = "NIC copy" },
            new() { DocumentName = "nic copy" },
        });

        Assert.IsType<BadRequestObjectResult>(result);
        Assert.Empty(await _db.DocumentRequirements.ToListAsync());
    }

    [Fact]
    public async Task UpdateFeeSchedules_NegativeAmount_IsRejected_AndUnknownServiceIsNotFound()
    {
        var service = await AddService();

        Assert.IsType<BadRequestObjectResult>(await _controller.UpdateFeeSchedules(service.Id, new() { new() { FeeType = "Normal", Amount = -5m } }));
        Assert.IsType<NotFoundObjectResult>(await _controller.UpdateFeeSchedules(404, new()));
        Assert.IsType<OkObjectResult>(await _controller.UpdateFeeSchedules(service.Id, new() { new() { FeeType = "Normal", Amount = 2500m } }));
    }

    [Fact]
    public async Task DeleteDocumentAndFee_UnknownIds_AreNotFound()
    {
        Assert.IsType<NotFoundObjectResult>(await _controller.DeleteDocumentRequirement(404));
        Assert.IsType<NotFoundObjectResult>(await _controller.DeleteFeeSchedule(404));
    }

    [Fact]
    public async Task UpdateWorkflow_MoreDepartmentsThanStages_IsRejected()
    {
        var service = await AddService();

        Assert.IsType<BadRequestObjectResult>(await _controller.UpdateWorkflow(service.Id,
            new UpdateWorkflowRequest { TotalStages = 1, WorkflowDepartments = new() { "A", "B" } }));
        Assert.IsType<NotFoundObjectResult>(await _controller.UpdateWorkflow(404, new UpdateWorkflowRequest()));
        Assert.IsType<OkObjectResult>(await _controller.UpdateWorkflow(service.Id,
            new UpdateWorkflowRequest { TotalStages = 2, WorkflowDepartments = new() { "A", "B" } }));
    }

    [Fact]
    public async Task EligibilityScore_UnknownService_IsNotFound()
    {
        var result = await _controller.CalculateEligibilityScore(new()
        {
            ServiceId = 404,
            CitizenProfile = new() { Age = 30, Citizenship = "Sri Lankan" }
        });

        Assert.IsType<NotFoundObjectResult>(result);
    }

    // ---- Stage details ----

    [Fact]
    public async Task StageDetails_WithoutATemplate_FallsBackToTheCatalogForStageOne()
    {
        var service = await AddService();
        _db.DocumentRequirements.Add(new DocumentRequirement { ServiceProcedureId = service.Id, DocumentName = "NIC copy", IsMandatory = true });
        _db.FeeSchedules.Add(new FeeSchedule { ServiceProcedureId = service.Id, FeeType = "Normal", Amount = 2500m });
        await _db.SaveChangesAsync();

        var body = TestJson.Body(await _controller.GetServiceStageDetails(service.Id, 1));

        Assert.Equal("NIC copy", body.GetProperty("documentRequirements")[0].GetProperty("documentName").GetString());
        Assert.Equal(2500m, body.GetProperty("feeSchedules")[0].GetProperty("amount").GetDecimal());

        var stageTwo = TestJson.Body(await _controller.GetServiceStageDetails(service.Id, 2));
        Assert.Equal(0, stageTwo.GetProperty("documentRequirements").GetArrayLength());
    }

    [Fact]
    public async Task StageDetails_UseTheStageTemplate_ForDocumentsDepartmentAndFee()
    {
        var service = await AddService();
        _db.DocumentRequirements.Add(new DocumentRequirement { ServiceProcedureId = service.Id, DocumentName = "Birth Certificate", Description = "Original", IsMandatory = true });
        _db.Templates.Add(new Template
        {
            FormName = "Stage 2",
            ServiceProcedureId = service.Id,
            StageOrder = 2,
            Department = "Divisional Secretariat",
            Fields =
            {
                new FormField { Label = "Birth certificate scan", Type = "file", OrderIndex = 1 },
                new FormField { Label = "Stage fee", Type = "payment", Options = "{\"amount\": 1200, \"feeType\": \"Stamp fee\"}" },
            }
        });
        await _db.SaveChangesAsync();

        var body = TestJson.Body(await _controller.GetServiceStageDetails(service.Id, 2));

        Assert.Equal("Divisional Secretariat", body.GetProperty("stageDepartment").GetString());
        var doc = body.GetProperty("documentRequirements")[0];
        Assert.Equal("Birth Certificate", doc.GetProperty("documentName").GetString());
        Assert.True(doc.GetProperty("isMandatory").GetBoolean());
        var fee = body.GetProperty("feeSchedules")[0];
        Assert.Equal("Stamp fee", fee.GetProperty("feeType").GetString());
        Assert.Equal(1200m, fee.GetProperty("amount").GetDecimal());
    }

    [Fact]
    public async Task StageDetails_UnknownService_IsNotFound() =>
        Assert.IsType<NotFoundObjectResult>(await _controller.GetServiceStageDetails(404, 1));
}
