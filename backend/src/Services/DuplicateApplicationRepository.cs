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
        var normalizedNic = citizenNic.Trim().ToUpperInvariant();

        string? targetServiceName = null;
        if (serviceProcedureId > 0)
        {
            targetServiceName = await _db.ServiceProcedures
                .Where(p => p.Id == serviceProcedureId)
                .Select(p => p.Name)
                .FirstOrDefaultAsync();
        }

        // Detect any active conflicting application for this citizen and service.
        // Finished or unsubmitted applications (Draft, AwaitingFeePayment, Completed, Rejected, Deleted)
        // are NEVER duplicate active submissions.
        // A PendingReview submission is only an active duplicate if it has an ACTIVE VerificationTask
        // (Pending, Revised, or Revision Requested).
        return await _db.ApplicationSubmissions.AnyAsync(s =>
            // Case-insensitive and trimmed; translates on PostgreSQL and the in-memory test provider alike
            s.CitizenNic.Trim().ToUpper() == normalizedNic &&
            (s.ServiceProcedureId == serviceProcedureId || (targetServiceName != null && s.ServiceProcedure != null && s.ServiceProcedure.Name == targetServiceName)) &&
            (excludeApplicationId == 0 || s.Id != excludeApplicationId) &&
            s.StageStatus != "Draft" &&
            s.StageStatus != "AwaitingFeePayment" &&
            s.StageStatus != "Completed" &&
            s.StageStatus != "Rejected" &&
            s.StageStatus != "Deleted" &&
            (s.StageStatus != "PendingReview" ||
             _db.VerificationTasks.Any(t => t.ApplicationId == s.Id &&
                                           (t.Status == "Pending" || t.Status == "Revised" || t.Status == "Revision Requested"))));
    }
}
