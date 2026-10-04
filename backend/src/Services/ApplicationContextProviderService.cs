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

            var currentStageNum = submission.CurrentStage > 0 ? submission.CurrentStage : 1;

            var currentStageTemplate = await _context.Templates
                .Include(t => t.Fields)
                .Where(t => t.ServiceProcedureId == submission.ServiceProcedureId && t.StageOrder == currentStageNum && t.Status == "Active")
                .OrderByDescending(t => t.CreatedAt)
                .FirstOrDefaultAsync(cancellationToken);

            HashSet<string>? stageFileLabels = null;
            bool stageRequiresPayment = false;
            decimal stageRequiredAmount = 0m;

            if (currentStageTemplate != null)
            {
                stageFileLabels = currentStageTemplate.Fields
                    .Where(f => f.Type == "file" || f.Type == "document" || f.Type == "documentUpload")
                    .Select(f => f.Label.Trim().TrimEnd(':').Trim())
                    .ToHashSet(StringComparer.OrdinalIgnoreCase);

                var payField = currentStageTemplate.Fields.FirstOrDefault(f => f.Type == "payment");
                if (payField != null && !string.IsNullOrWhiteSpace(payField.Options))
                {
                    try
                    {
                        using var pDoc = JsonDocument.Parse(payField.Options);
                        if (pDoc.RootElement.TryGetProperty("amount", out var amt) && amt.ValueKind == JsonValueKind.Number)
                            stageRequiredAmount = amt.GetDecimal();
                        else if (pDoc.RootElement.TryGetProperty("feeAmount", out var famt) && famt.ValueKind == JsonValueKind.Number)
                            stageRequiredAmount = famt.GetDecimal();
                        stageRequiresPayment = stageRequiredAmount > 0;
                    }
                    catch { }
                }
            }

            var dbDocs = await _context.SubmissionDocuments
                .Where(d => d.ApplicationId == applicationId)
                .ToListAsync(cancellationToken);

            List<string> documents;
            if (currentStageTemplate != null)
            {
                if (stageFileLabels != null && stageFileLabels.Count > 0)
                {
                    documents = dbDocs
                        .Where(d => !string.IsNullOrWhiteSpace(d.FieldLabel) && stageFileLabels.Contains(d.FieldLabel.Trim().TrimEnd(':').Trim()))
                        .Select(d => $"{d.FieldLabel}: {d.FileName}")
                        .Distinct(StringComparer.OrdinalIgnoreCase)
                        .ToList();
                }
                else
                {
                    documents = new List<string>();
                }
            }
            else
            {
                documents = (currentStageNum <= 1)
                    ? dbDocs.Select(d => !string.IsNullOrWhiteSpace(d.FieldLabel) ? $"{d.FieldLabel}: {d.FileName}" : d.FileName).ToList()
                    : new List<string>();
            }

            var payment = await _context.Payments
                .Where(p => p.ApplicationId == applicationId)
                .OrderByDescending(p => p.Id)
                .FirstOrDefaultAsync(cancellationToken);

            bool isPaymentVerified;
            decimal paidAmount;
            if (stageRequiresPayment)
            {
                paidAmount = payment?.Amount ?? 0m;
                isPaymentVerified = payment?.Status == "Paid" || payment?.Status == "Verified";
            }
            else
            {
                paidAmount = 0m;
                isPaymentVerified = true;
            }

            return new ApplicationCaseContext
            {
                ApplicationId = submission.Id,
                ServiceProcedureId = submission.ServiceProcedureId,
                ServiceName = submission.ServiceProcedure?.Name ?? "Government Service",
                DepartmentName = submission.CurrentDepartment ?? submission.ServiceProcedure?.Category ?? "Government Department",
                CitizenNic = submission.CitizenNic,
                CitizenName = citizenName,
                CitizenAge = age,
                CurrentStage = currentStageNum,
                MaxStages = submission.MaxStages > 0 ? submission.MaxStages : 1,
                StageStatus = submission.StageStatus,
                FormAnswers = answers,
                UploadedDocumentNames = documents,
                PaidAmount = paidAmount,
                IsPaymentVerified = isPaymentVerified
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
