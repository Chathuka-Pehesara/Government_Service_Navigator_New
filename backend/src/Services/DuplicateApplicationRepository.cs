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

        // A PendingReview application is only a real duplicate if it has an active VerificationTask
        // (i.e. it is genuinely in an officer's queue). Orphaned PendingReview records that never
        // created a task (e.g. from a failed/dropped submission attempt) must NOT block re-submission.
        return await _db.ApplicationSubmissions.AnyAsync(s =>
            s.CitizenNic == normalizedNic &&
            s.ServiceProcedureId == serviceProcedureId &&
            (excludeApplicationId == 0 || s.Id != excludeApplicationId) &&
            s.StageStatus != "Completed" &&
            s.StageStatus != "Rejected" &&
            s.StageStatus != "Deleted" &&
            s.StageStatus != "Draft" &&
            s.StageStatus != "AwaitingFeePayment" &&
            // For PendingReview: only block if there is an ACTIVE VerificationTask (Pending or Revised).
            // Tasks that are already Approved or Rejected mean the application lifecycle ended —
            // the citizen should be allowed to submit a fresh application.
            (s.StageStatus != "PendingReview" ||
             _db.VerificationTasks.Any(t => t.ApplicationId == s.Id &&
                                           (t.Status == "Pending" || t.Status == "Revised" || t.Status == "Revision Requested"))));
    }
}
