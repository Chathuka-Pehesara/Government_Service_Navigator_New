using System.Text.Json;
using Government_Service_Navigator.AgenticAi.Tools.GetDocumentRequirements;
using Government_Service_Navigator.AgenticAi.Tools.CalculateFee;
using Government_Service_Navigator.AgenticAi.Tools.PrefillApplication;
using Government_Service_Navigator.Backend.Data.Context;
using Microsoft.EntityFrameworkCore;

namespace Government_Service_Navigator.Backend.Services;

public class FeeScheduleRepository : IFeeScheduleRepository
{
    private readonly AppDbContext _db;

    public FeeScheduleRepository(AppDbContext db)
    {
        _db = db;
    }

    public async Task<List<FeeScheduleEntry>> GetFeeSchedulesAsync(int serviceProcedureId, int? stage = null, CancellationToken cancellationToken = default)
    {
        if (stage.HasValue && stage.Value > 0)
        {
            var stageTemplate = await _db.Templates
                .Include(t => t.Fields)
                .Where(t => t.ServiceProcedureId == serviceProcedureId && t.StageOrder == stage.Value && t.Status == "Active")
                .OrderByDescending(t => t.CreatedAt)
                .FirstOrDefaultAsync(cancellationToken);

            if (stageTemplate != null)
            {
                var paymentField = stageTemplate.Fields.FirstOrDefault(f => f.Type == "payment");
                if (paymentField != null && !string.IsNullOrWhiteSpace(paymentField.Options))
                {
                    try
                    {
                        using var pDoc = JsonDocument.Parse(paymentField.Options);
                        decimal stageAmt = 0m;
                        if (pDoc.RootElement.TryGetProperty("amount", out var amt))
                        {
                            if (amt.ValueKind == JsonValueKind.Number) stageAmt = amt.GetDecimal();
                            else if (amt.ValueKind == JsonValueKind.String && decimal.TryParse(amt.GetString(), System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out var parsed)) stageAmt = parsed;
                        }
                        else if (pDoc.RootElement.TryGetProperty("feeAmount", out var famt))
                        {
                            if (famt.ValueKind == JsonValueKind.Number) stageAmt = famt.GetDecimal();
                            else if (famt.ValueKind == JsonValueKind.String && decimal.TryParse(famt.GetString(), System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out var parsed)) stageAmt = parsed;
                        }

                        if (stageAmt > 0)
                        {
                            string feeName = "Statutory Processing Fee";
                            if (pDoc.RootElement.TryGetProperty("feeType", out var ft) && ft.GetString() is string s && !string.IsNullOrWhiteSpace(s))
                                feeName = s;
                            else if (!string.IsNullOrWhiteSpace(paymentField.Label))
                                feeName = paymentField.Label;
                            return new List<FeeScheduleEntry> { new(feeName, stageAmt, DateTime.UtcNow) };
                        }
                    }
                    catch { }
                }

                // If stage 1 template has no explicit embedded payment field, check FeeSchedules table
                if (stage.Value <= 1)
                {
                    var baseFees = await _db.FeeSchedules
                        .Where(f => f.ServiceProcedureId == serviceProcedureId)
                        .Select(f => new FeeScheduleEntry(f.FeeType, f.Amount, f.EffectiveDate))
                        .ToListAsync(cancellationToken);
                    if (baseFees.Any()) return baseFees;
                }

                // If template exists for this stage, ADR-0009 specifies the stage's fee is defined by this template's payment field.
                // If it has no payment field or 0 fee, this stage has NO fee.
                return new List<FeeScheduleEntry>();
            }

            // If stage > 1 and no specific template found, stage has no fee
            if (stage.Value > 1)
            {
                return new List<FeeScheduleEntry>();
            }
        }

        return await _db.FeeSchedules
            .Where(f => f.ServiceProcedureId == serviceProcedureId)
            .Select(f => new FeeScheduleEntry(f.FeeType, f.Amount, f.EffectiveDate))
            .ToListAsync(cancellationToken);
    }
}

public class ApplicationTemplateRepository : IApplicationTemplateRepository
{
    private readonly AppDbContext _db;

    public ApplicationTemplateRepository(AppDbContext db)
    {
        _db = db;
    }

    public async Task<List<FormFieldDefinition>> GetFormFieldsAsync(int serviceProcedureId, int? stage = null, CancellationToken cancellationToken = default)
    {
        var query = _db.Templates
            .Include(t => t.Fields)
            .Where(t => t.ServiceProcedureId == serviceProcedureId && t.Status == "Active");

        if (stage.HasValue && stage.Value > 0)
        {
            query = query.Where(t => t.StageOrder == stage.Value);
        }

        var template = await query
            .OrderByDescending(t => t.CreatedAt)
            .FirstOrDefaultAsync(cancellationToken);

        if (template == null) return new List<FormFieldDefinition>();

        return template.Fields
            .OrderBy(f => f.OrderIndex)
            .Select(f => new FormFieldDefinition(f.Label, f.Type, f.IsRequired, f.OrderIndex))
            .ToList();
    }
}

public class DocumentRequirementRepository : IDocumentRequirementRepository
{
    private readonly AppDbContext _db;

    public DocumentRequirementRepository(AppDbContext db)
    {
        _db = db;
    }

    public async Task<List<string>> GetDocumentNamesAsync(int serviceProcedureId, int? stage = null, CancellationToken cancellationToken = default)
    {
        if (stage.HasValue && stage.Value > 0)
        {
            var stageTemplate = await _db.Templates
                .Include(t => t.Fields)
                .Where(t => t.ServiceProcedureId == serviceProcedureId && t.StageOrder == stage.Value && t.Status == "Active")
                .OrderByDescending(t => t.CreatedAt)
                .FirstOrDefaultAsync(cancellationToken);

            if (stageTemplate != null)
            {
                var fileFields = stageTemplate.Fields
                    .Where(f => f.Type == "file" || f.Type == "document" || f.Type == "documentUpload")
                    .Select(f => f.Label.Trim().TrimEnd(':').Trim())
                    .Where(l => !string.IsNullOrWhiteSpace(l))
                    .Distinct()
                    .ToList();

                // The stage template explicitly specifies which evidentiary documents are required for this stage.
                // If fileFields is empty, this stage requires NO documents.
                return fileFields;
            }

            // If stage > 1 and no active template exists, subsequent stages require no documents by default.
            if (stage.Value > 1)
            {
                return new List<string>();
            }
        }

        return await _db.DocumentRequirements
            .Where(d => d.ServiceProcedureId == serviceProcedureId)
            .OrderBy(d => d.Id)
            .Select(d => d.DocumentName)
            .ToListAsync(cancellationToken);
    }
}
