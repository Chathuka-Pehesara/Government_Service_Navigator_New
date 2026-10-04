using Government_Service_Navigator.AgenticAi.Tools.CheckDuplicateApplication;
using Government_Service_Navigator.Backend.Data.Context;
using Microsoft.EntityFrameworkCore;

namespace Government_Service_Navigator.Backend.Services;

public class DuplicateApplicationRepository : IDuplicateApplicationRepository
{
    private readonly AppDbContext _db;

    public DuplicateApplicationRepository(AppDbContext db)
    {
        _db = db;
    }

    public async Task<bool> HasDuplicateAsync(string citizenNic, int serviceProcedureId, int excludeApplicationId = 0)
    {
        if (string.IsNullOrWhiteSpace(citizenNic)) return false;
        var normalizedNic = citizenNic.Trim();

        string? targetServiceName = null;
        if (serviceProcedureId > 0)
        {
            targetServiceName = await _db.ServiceProcedures
                .Where(p => p.Id == serviceProcedureId)
                .Select(p => p.Name)
                .FirstOrDefaultAsync();
        }

        // Detect any active or officially completed application for this citizen and service
        return await _db.ApplicationSubmissions.AnyAsync(s =>
            (s.CitizenNic == normalizedNic || EF.Functions.ILike(s.CitizenNic, normalizedNic) || s.CitizenNic.Trim() == normalizedNic) &&
            (s.ServiceProcedureId == serviceProcedureId || (targetServiceName != null && s.ServiceProcedure != null && s.ServiceProcedure.Name == targetServiceName)) &&
            (excludeApplicationId == 0 || s.Id != excludeApplicationId) &&
            s.StageStatus != "Rejected" &&
            ((s.StageStatus != "Deleted" && s.StageStatus != "Draft") || 
             _db.VerificationTasks.Any(t => t.ApplicationId == s.Id && t.Status != "Rejected" && t.Status != "Cancelled") ||
             _db.Payments.Any(p => p.ApplicationId == s.Id && p.Status != "Failed")));
    }
}
