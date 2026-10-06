using Government_Service_Navigator.Backend.Data.Context;
using Government_Service_Navigator.Backend.DTOs;
using Government_Service_Navigator.Backend.Models.Entities;
using Government_Service_Navigator.Backend.Services;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace Government_Service_Navigator.Backend.Tests.Services;

/// <summary>
/// The service catalog: create, update and retire a service, and replace its eligibility rules,
/// document requirements, fee schedules and workflow.
/// </summary>
public class ServiceCatalogServiceTests
{
    private readonly AppDbContext _db = TestDb.Create();
    private readonly ServiceCatalogService _catalog;

    public ServiceCatalogServiceTests() => _catalog = new ServiceCatalogService(_db);

    private async Task<ServiceProcedure> AddService(string serviceId = "GSN-SRV-001", string status = "Active")
    {
        var service = new ServiceProcedure { ServiceId = serviceId, Name = "Passport Renewal", Category = "Transport & Travel", Status = status };
        _db.ServiceProcedures.Add(service);
        await _db.SaveChangesAsync();
        return service;
    }

    // ---- Create ----

    [Fact]
    public async Task CreateService_FirstService_GetsTheFirstCode()
    {
        var created = await _catalog.CreateServiceAsync(new ServiceProcedure { ServiceId = "ANY", Name = "Police Clearance", Category = "Legal & Security" });

        Assert.Equal("GSN-SRV-001", created.ServiceId);
        Assert.True(created.Id > 0);
    }

    [Fact]
    public async Task CreateService_IgnoresTheClientCode_AndCountsRetiredServices()
    {
        await AddService("GSN-SRV-002");
        await AddService("GSN-SRV-007", status: "Retired");

        var created = await _catalog.CreateServiceAsync(new ServiceProcedure { ServiceId = "GSN-SRV-003", Name = "Police Clearance", Category = "Legal & Security" });

        Assert.Equal("GSN-SRV-008", created.ServiceId);
    }

    [Fact]
    public async Task CreateService_SkipsCodesThatAreNotInTheGsnFormat()
    {
        await AddService("CUSTOM-99");
        await AddService("gsn-srv-004");

        var created = await _catalog.CreateServiceAsync(new ServiceProcedure { ServiceId = "X", Name = "Police Clearance", Category = "Legal & Security" });

        Assert.Equal("GSN-SRV-005", created.ServiceId);
    }

    // ---- Read ----

    [Fact]
    public async Task GetAllServices_HidesRetiredServices_AndIncludesDocumentsAndFees()
    {
        var active = await AddService("GSN-SRV-001");
        await AddService("GSN-SRV-002", status: "Retired");
        _db.DocumentRequirements.Add(new DocumentRequirement { ServiceProcedureId = active.Id, DocumentName = "NIC copy" });
        _db.FeeSchedules.Add(new FeeSchedule { ServiceProcedureId = active.Id, FeeType = "Normal", Amount = 3500m });
        await _db.SaveChangesAsync();

        var all = (await _catalog.GetAllServicesAsync()).ToList();

        var only = Assert.Single(all);
        Assert.Equal("GSN-SRV-001", only.ServiceId);
        Assert.Single(only.DocumentRequirements);
        Assert.Single(only.FeeSchedules);
    }

    [Fact]
    public async Task GetServiceById_UnknownId_IsNull() => Assert.Null(await _catalog.GetServiceByIdAsync(404));

    // ---- Update and retire ----

    [Fact]
    public async Task UpdateService_ChangesTheBasicDetails()
    {
        var service = await AddService();

        var updated = await _catalog.UpdateServiceAsync(service.Id, new ServiceProcedure
        {
            ServiceId = "GSN-SRV-001", Name = "Passport Renewal (Express)", Category = "Immigration", Status = "Draft"
        });

        Assert.NotNull(updated);
        var stored = await _db.ServiceProcedures.SingleAsync();
        Assert.Equal("Passport Renewal (Express)", stored.Name);
        Assert.Equal("Immigration", stored.Category);
        Assert.Equal("Draft", stored.Status);
    }

    [Fact]
    public async Task UpdateService_UnknownId_IsNull() =>
        Assert.Null(await _catalog.UpdateServiceAsync(404, new ServiceProcedure { ServiceId = "A1", Name = "Name", Category = "C" }));

    [Fact]
    public async Task RetireService_MarksItRetired_InsteadOfDeletingIt()
    {
        var service = await AddService();

        Assert.True(await _catalog.RetireServiceAsync(service.Id));

        Assert.Equal("Retired", (await _db.ServiceProcedures.SingleAsync()).Status);
        Assert.False(await _catalog.RetireServiceAsync(404));
    }

    // ---- Eligibility rules ----

    [Fact]
    public async Task UpdateEligibilityRules_ReplacesTheOldRules()
    {
        var service = await AddService();
        await _catalog.UpdateEligibilityRulesAsync(service.Id, new() { new() { Field = "Age", Operator = ">=", Value = "16" } });

        await _catalog.UpdateEligibilityRulesAsync(service.Id, new()
        {
            new() { Field = "Age", Operator = ">=", Value = "18" },
            new() { Field = "Citizenship", Operator = "==", Value = "Sri Lankan" },
        });

        var rules = await _db.EligibilityRules.OrderBy(r => r.Field).ToListAsync();
        Assert.Equal(2, rules.Count);
        Assert.Equal("18", rules[0].Value);
        Assert.All(rules, r => Assert.Equal(service.Id, r.ServiceProcedureId));
    }

    [Fact]
    public async Task UpdateEligibilityRules_UnknownService_Throws() =>
        await Assert.ThrowsAsync<KeyNotFoundException>(() => _catalog.UpdateEligibilityRulesAsync(404, new()));

    // ---- Document requirements ----

    [Fact]
    public async Task UpdateDocumentRequirements_AddsUpdatesAndRemoves()
    {
        var service = await AddService();
        var keep = new DocumentRequirement { ServiceProcedureId = service.Id, DocumentName = "NIC copy", IsMandatory = false };
        var drop = new DocumentRequirement { ServiceProcedureId = service.Id, DocumentName = "Old photo" };
        _db.DocumentRequirements.AddRange(keep, drop);
        await _db.SaveChangesAsync();

        var result = await _catalog.UpdateDocumentRequirementsAsync(service.Id, new()
        {
            new() { Id = keep.Id, DocumentName = "NIC (both sides)", Description = "Clear scan", IsMandatory = true },
            new() { DocumentName = "Birth certificate", IsMandatory = true },
        });

        var docs = result.DocumentRequirements.OrderBy(d => d.DocumentName).ToList();
        Assert.Equal(new[] { "Birth certificate", "NIC (both sides)" }, docs.Select(d => d.DocumentName));
        Assert.True(docs[1].IsMandatory);
        Assert.Equal("Clear scan", docs[1].Description);
        Assert.Null(await _db.DocumentRequirements.FindAsync(drop.Id));
    }

    [Fact]
    public async Task UpdateDocumentRequirements_UnknownService_Throws() =>
        await Assert.ThrowsAsync<KeyNotFoundException>(() => _catalog.UpdateDocumentRequirementsAsync(404, new()));

    [Fact]
    public async Task DeleteDocumentRequirement_RemovesOnlyThatDocument()
    {
        var service = await AddService();
        var a = new DocumentRequirement { ServiceProcedureId = service.Id, DocumentName = "A" };
        var b = new DocumentRequirement { ServiceProcedureId = service.Id, DocumentName = "B" };
        _db.DocumentRequirements.AddRange(a, b);
        await _db.SaveChangesAsync();

        Assert.True(await _catalog.DeleteDocumentRequirementAsync(a.Id));
        Assert.False(await _catalog.DeleteDocumentRequirementAsync(a.Id));
        Assert.Equal("B", (await _db.DocumentRequirements.SingleAsync()).DocumentName);
    }

    // ---- Fee schedules ----

    [Fact]
    public async Task UpdateFeeSchedules_AddsUpdatesAndRemoves()
    {
        var service = await AddService();
        var keep = new FeeSchedule { ServiceProcedureId = service.Id, FeeType = "Normal", Amount = 3000m };
        var drop = new FeeSchedule { ServiceProcedureId = service.Id, FeeType = "Late", Amount = 500m };
        _db.FeeSchedules.AddRange(keep, drop);
        await _db.SaveChangesAsync();
        var effective = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);

        var result = await _catalog.UpdateFeeSchedulesAsync(service.Id, new()
        {
            new() { Id = keep.Id, FeeType = "Normal", Amount = 3500m, EffectiveDate = effective },
            new() { FeeType = "Express", Amount = 9000m },
        });

        var fees = result.FeeSchedules.OrderBy(f => f.Amount).ToList();
        Assert.Equal(new[] { 3500m, 9000m }, fees.Select(f => f.Amount));
        Assert.Equal(effective, fees[0].EffectiveDate);
        Assert.Null(await _db.FeeSchedules.FindAsync(drop.Id));
    }

    [Fact]
    public async Task UpdateFeeSchedules_UnknownService_Throws() =>
        await Assert.ThrowsAsync<KeyNotFoundException>(() => _catalog.UpdateFeeSchedulesAsync(404, new()));

    [Fact]
    public async Task DeleteFeeSchedule_RemovesIt_AndReportsUnknownIds()
    {
        var service = await AddService();
        var fee = new FeeSchedule { ServiceProcedureId = service.Id, FeeType = "Normal", Amount = 3000m };
        _db.FeeSchedules.Add(fee);
        await _db.SaveChangesAsync();

        Assert.True(await _catalog.DeleteFeeScheduleAsync(fee.Id));
        Assert.False(await _catalog.DeleteFeeScheduleAsync(fee.Id));
        Assert.Empty(await _db.FeeSchedules.ToListAsync());
    }

    // ---- Workflow ----

    [Fact]
    public async Task UpdateWorkflow_StoresTheStagesAndDepartmentsAsJson()
    {
        var service = await AddService();

        var updated = await _catalog.UpdateWorkflowAsync(service.Id, 2, new() { "Police Department", "Divisional Secretariat" });

        Assert.NotNull(updated);
        Assert.Equal(2, updated.TotalStages);
        Assert.Equal("[\"Police Department\",\"Divisional Secretariat\"]", updated.WorkflowDepartments);
        Assert.Null(await _catalog.UpdateWorkflowAsync(404, 1, new()));
    }

    // ---- Eligibility score ----

    [Fact]
    public async Task EligibilityScore_ServiceWithoutRules_IsFullyEligible()
    {
        var service = await AddService();

        var result = await _catalog.CalculateEligibilityScoreAsync(service.Id, new CitizenProfileDto { Age = 10, Citizenship = "Other" });

        Assert.True(result.IsEligible);
        Assert.Equal(100, result.MatchPercentage);
    }

    [Fact]
    public async Task EligibilityScore_ListsEachFailedRule_AndScoresThePassedShare()
    {
        var service = await AddService();
        await _catalog.UpdateEligibilityRulesAsync(service.Id, new()
        {
            new() { Field = "Age", Operator = ">=", Value = "18" },
            new() { Field = "Citizenship", Operator = "==", Value = "Sri Lankan" },
        });

        var result = await _catalog.CalculateEligibilityScoreAsync(service.Id, new CitizenProfileDto { Age = 30, Citizenship = "Indian" });

        Assert.False(result.IsEligible);
        Assert.Equal(50, result.MatchPercentage);
        Assert.Equal("Failed requirement: Citizenship == Sri Lankan", Assert.Single(result.MissingCriteria));
    }

    [Fact]
    public async Task EligibilityScore_CitizenshipIgnoresCase()
    {
        var service = await AddService();
        await _catalog.UpdateEligibilityRulesAsync(service.Id, new() { new() { Field = "Citizenship", Operator = "==", Value = "Sri Lankan" } });

        var result = await _catalog.CalculateEligibilityScoreAsync(service.Id, new CitizenProfileDto { Age = 30, Citizenship = "sri lankan" });

        Assert.True(result.IsEligible);
    }

    [Fact]
    public async Task EligibilityScore_UnknownService_Throws() =>
        await Assert.ThrowsAsync<KeyNotFoundException>(() =>
            _catalog.CalculateEligibilityScoreAsync(404, new CitizenProfileDto { Age = 30, Citizenship = "Sri Lankan" }));
}
