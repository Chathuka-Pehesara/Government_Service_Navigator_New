using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Government_Service_Navigator.AgenticAi.Orchestration;
using Government_Service_Navigator.Backend.Data.Context;
using Microsoft.EntityFrameworkCore;

namespace Government_Service_Navigator.Backend.Services
{
    public class ApplicationContextProviderService : IApplicationContextProvider
    {
        private readonly AppDbContext _context;

        public ApplicationContextProviderService(AppDbContext context)
        {
            _context = context;
        }

        public async Task<ApplicationCaseContext?> GetApplicationContextAsync(int applicationId, CancellationToken cancellationToken = default)
        {
            var submission = await _context.ApplicationSubmissions
                .Include(s => s.ServiceProcedure)
                .FirstOrDefaultAsync(s => s.Id == applicationId, cancellationToken);

            if (submission == null) return null;

            Dictionary<string, string> answers = new();
            if (!string.IsNullOrWhiteSpace(submission.FormDataJson))
            {
                try
                {
                    answers = JsonSerializer.Deserialize<Dictionary<string, string>>(submission.FormDataJson) ?? new();
                }
                catch { }
            }

            var citizenUser = await _context.Users
                .FirstOrDefaultAsync(u => u.NicNumber == submission.CitizenNic, cancellationToken);

            var citizenName = citizenUser?.FullName
                ?? answers.FirstOrDefault(kv => kv.Key.Contains("name", StringComparison.OrdinalIgnoreCase)).Value
                ?? submission.CitizenNic;

            var derivedAge = ApplicationDraftingService.AgeFromNic(submission.CitizenNic, DateTime.UtcNow);
            int age = derivedAge ?? 25;

            var documents = await _context.SubmissionDocuments
                .Where(d => d.ApplicationId == applicationId)
                .Select(d => !string.IsNullOrWhiteSpace(d.FieldLabel) ? $"{d.FieldLabel}: {d.FileName}" : d.FileName)
                .ToListAsync(cancellationToken);

            var payment = await _context.Payments
                .Where(p => p.ApplicationId == applicationId)
                .OrderByDescending(p => p.Id)
                .FirstOrDefaultAsync(cancellationToken);

            return new ApplicationCaseContext
            {
                ApplicationId = submission.Id,
                ServiceProcedureId = submission.ServiceProcedureId,
                ServiceName = submission.ServiceProcedure?.Name ?? "Government Service",
                DepartmentName = submission.CurrentDepartment ?? submission.ServiceProcedure?.Category ?? "Government Department",
                CitizenNic = submission.CitizenNic,
                CitizenName = citizenName,
                CitizenAge = age,
                CurrentStage = submission.CurrentStage > 0 ? submission.CurrentStage : 1,
                MaxStages = submission.MaxStages > 0 ? submission.MaxStages : 1,
                StageStatus = submission.StageStatus,
                FormAnswers = answers,
                UploadedDocumentNames = documents,
                PaidAmount = payment?.Amount ?? 0m,
                IsPaymentVerified = payment?.Status == "Paid" || payment?.Status == "Verified"
            };
        }

        public async Task<List<string>> GetAvailableServiceNamesAsync(CancellationToken cancellationToken = default)
        {
            return await _context.ServiceProcedures
                .Where(s => s.Status == "Active")
                .Select(s => s.Name)
                .Distinct()
                .ToListAsync(cancellationToken);
        }
    }
}
