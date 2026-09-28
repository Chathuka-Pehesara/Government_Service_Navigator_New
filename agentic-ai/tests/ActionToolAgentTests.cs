using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using AgenticAi.Agents.IntakePlanningAgent;
using Government_Service_Navigator.AgenticAi.Agents.ActionToolAgent;
using Government_Service_Navigator.AgenticAi.Agents.ActionToolAgent.DTOs;
using Government_Service_Navigator.AgenticAi.Agents.ActionToolAgent.Retrieval;
using Government_Service_Navigator.AgenticAi.Agents.EligibilityDocumentAgent.DTOs;
using Government_Service_Navigator.AgenticAi.Tools.CalculateFee;
using Government_Service_Navigator.AgenticAi.Tools.FindAppointmentSlot;
using Government_Service_Navigator.AgenticAi.Tools.PrefillApplication;
using Pgvector;
using Xunit;

namespace Government_Service_Navigator.AgenticAi.Tests
{
    public class ActionToolAgentTests
    {
        private class StubFeeRepository : IFeeScheduleRepository
        {
            public List<FeeScheduleEntry> Fees { get; } = new();
            public Task<List<FeeScheduleEntry>> GetFeeSchedulesAsync(int serviceProcedureId, int? stage = null, CancellationToken cancellationToken = default)
                => Task.FromResult(Fees);
        }

        private class StubTemplateRepository : IApplicationTemplateRepository
        {
            public List<FormFieldDefinition> Fields { get; } = new();
            public Task<List<FormFieldDefinition>> GetFormFieldsAsync(int serviceProcedureId, int? stage = null, CancellationToken cancellationToken = default)
                => Task.FromResult(Fields);
        }

        private class StubRetriever : IActionVectorRetriever
        {
            public Task<List<string>> GetRelevantActionContextAsync(Vector queryEmbedding, int limit = 5, CancellationToken cancellationToken = default)
                => Task.FromResult(new List<string> { "Fee schedule for Passport Renewal: Standard Processing: LKR 10,000.00." });
        }

        private class StubEmbeddingService : IEmbeddingService
        {
            public Task<Vector> GetEmbeddingAsync(string text) => Task.FromResult(new Vector(new float[768]));
        }

        private readonly StubFeeRepository _fees = new();
        private readonly StubTemplateRepository _templates = new();
        private readonly StubEmbeddingService _embeddings = new();
        private readonly ActionToolAgent _agent;

        public ActionToolAgentTests()
        {
            FindAppointmentSlotTool.ClearProposedSlots();
            _agent = new ActionToolAgent(
                new StubRetriever(),
                _embeddings,
                new CalculateFeeTool(_fees),
                new FindAppointmentSlotTool(),
                new PrefillApplicationTool(_templates));
        }

        private static ActionDraftRequest BuildRequest(bool eligible = true, Dictionary<string, string>? extra = null) => new(
            ApplicationId: 5001,
            ServiceProcedureId: 1,
            ServiceName: "Passport Renewal & Application",
            Applicant: new ApplicantDetails
            {
                CitizenNic = "199512345678",
                FullName = "Nimal Silva",
                Email = "nimal@example.com",
                Age = 30,
                CitizenshipStatus = "Sri Lankan",
                AnnualIncome = 900000m,
                EmploymentStatus = "Employed",
                AdditionalAttributes = extra ?? new Dictionary<string, string>()
            },
            Eligibility: new EligibilityPlanResponse(
                IsEligible: eligible,
                MatchPercentage: eligible ? 100 : 40,
                MissingCriteria: eligible ? new List<string>() : new List<string> { "Applicant must be at least 18 years old." },
                RequiredDocuments: new List<string> { "NIC" },
                MissingDocuments: new List<string>(),
                Reasoning: "",
                RetrievedContextSnippets: new List<string>()),
            ProvidedDocuments: new List<string> { "NIC Copy.pdf" });

        [Fact]
        public async Task GoldenCase_EligibleCitizen_ProducesCompleteDraft_WithFeeAndSlot()
        {
            _fees.Fees.Add(new FeeScheduleEntry("Standard Processing", 10000m, DateTime.UtcNow.AddYears(-1)));
            _fees.Fees.Add(new FeeScheduleEntry("Express One Day Service", 20000m, DateTime.UtcNow.AddYears(-1)));

            var result = await _agent.PrepareDraftAsync(BuildRequest());

            Assert.True(result.IsReadyForValidation);
            Assert.NotNull(result.Draft);
            Assert.Equal(10000m, result.Draft!.CalculatedFee); // express fee not applied
            Assert.NotNull(result.Draft.ProposedAppointmentDate);
            Assert.Equal("199512345678", result.Draft.FormFields["NIC Number"]);
            Assert.Equal("Nimal Silva", result.Draft.FormFields["Full Name"]);
            Assert.Equal(new[] { "prefill_application", "calculate_fee", "find_appointment_slot" }, result.ToolCalls.Select(t => t.ToolName));
        }

        [Fact]
        public async Task SafeFailure_IneligibleCitizen_NoDraftAndClearReason()
        {
            var result = await _agent.PrepareDraftAsync(BuildRequest(eligible: false));

            Assert.False(result.IsReadyForValidation);
            Assert.Null(result.Draft);
            Assert.Contains("Applicant must be at least 18 years old.", result.Blockers);
            Assert.Empty(result.ToolCalls);
        }

        [Fact]
        public async Task MissingRequiredTemplateField_BlocksValidation()
        {
            _templates.Fields.Add(new FormFieldDefinition("Full Name", "text", true, 0));
            _templates.Fields.Add(new FormFieldDefinition("Business Name", "text", true, 1));

            var result = await _agent.PrepareDraftAsync(BuildRequest());

            Assert.False(result.IsReadyForValidation);
            Assert.Contains("Business Name", result.UnfilledRequiredFields);
            Assert.NotNull(result.Draft);
        }

        [Fact]
        public async Task UnsuppliedRequiredField_StaysEmpty_AndOfficialContextIsReturned()
        {
            _templates.Fields.Add(new FormFieldDefinition("Business Name", "text", true, 0));

            var result = await _agent.PrepareDraftAsync(BuildRequest());

            Assert.DoesNotContain("Business Name", result.Draft!.FormFields.Keys);
            Assert.False(result.IsReadyForValidation);
            Assert.Contains("Fee schedule for Passport Renewal: Standard Processing: LKR 10,000.00.", result.RetrievedContextSnippets);
        }

        [Fact]
        public async Task PrefillUsesAdditionalAttributes_ByLabel()
        {
            _templates.Fields.Add(new FormFieldDefinition("Business Name", "text", true, 0));

            var result = await _agent.PrepareDraftAsync(BuildRequest(extra: new() { { "business name", "Silva Traders" } }));

            Assert.Equal("Silva Traders", result.Draft!.FormFields["Business Name"]);
            Assert.True(result.IsReadyForValidation);
        }

        [Fact]
        public async Task CalculateFee_UsesLatestRevisionInForce_IgnoresFutureRates()
        {
            _fees.Fees.Add(new FeeScheduleEntry("Renewal Fee", 3000m, new DateTime(2024, 1, 1)));
            _fees.Fees.Add(new FeeScheduleEntry("Renewal Fee", 3500m, new DateTime(2025, 1, 1)));
            _fees.Fees.Add(new FeeScheduleEntry("Renewal Fee", 9999m, new DateTime(2099, 1, 1)));

            var fee = await new CalculateFeeTool(_fees).CalculateAsync(3, asOf: new DateTime(2026, 6, 1));

            Assert.Equal(3500m, fee.TotalAmount);
        }

        [Fact]
        public async Task FindSlot_SkipsWeekends_RespectsLeadTime_AndOfficeHours()
        {
            // Friday 2026-09-25 10:00 Sri Lanka time → earliest is Tuesday 2026-09-29
            var nowUtc = new DateTime(2026, 9, 25, 4, 30, 0, DateTimeKind.Utc);
            var tool = new FindAppointmentSlotTool();

            var first = await tool.FindSlotAsync(99, nowUtc: nowUtc);
            var second = await tool.FindSlotAsync(99, nowUtc: nowUtc);

            Assert.True(first.IsSlotFound);
            Assert.Equal(new DateTime(2026, 9, 29, 3, 30, 0, DateTimeKind.Utc), first.SlotStartUtc); // 09:00 +05:30
            Assert.Equal(first.SlotStartUtc!.Value.AddMinutes(30), second.SlotStartUtc);            // not double-booked
        }

        private class StubLlmService : global::AgenticAi.Services.ILlmService
        {
            public bool IsConfigured => true;
            public string ModelName => "stub-model";
            public string ResponseToReturn { get; set; } = "{}";

            public Task<string?> GenerateChatCompletionAsync(string systemPrompt, string userPrompt, bool jsonMode = false, CancellationToken cancellationToken = default)
                => Task.FromResult<string?>(ResponseToReturn);
        }

        [Fact]
        public async Task ActionAgent_WithLlmService_SynthesizesOfficerNotesAndReasoning()
        {
            _fees.Fees.Add(new FeeScheduleEntry("Standard Processing", 10000m, DateTime.UtcNow.AddYears(-1)));
            var stubLlm = new StubLlmService
            {
                ResponseToReturn = """
                {
                    "notesForOfficer": [
                        "Verify physical police report at counter",
                        "Applicant opted for standard processing schedule"
                    ],
                    "reasoning": "Application pre-filled successfully. Standard processing fee of LKR 10,000.00 assessed according to statutory regulations. Appointment slot proposed for Colombo headquarters."
                }
                """
            };

            var agent = new ActionToolAgent(
                new StubRetriever(),
                _embeddings,
                new CalculateFeeTool(_fees),
                new FindAppointmentSlotTool(),
                new PrefillApplicationTool(_templates),
                stubLlm);

            var result = await agent.PrepareDraftAsync(BuildRequest());

            Assert.True(result.IsReadyForValidation);
            Assert.Contains("Verify physical police report at counter", result.NotesForOfficer);
            Assert.Contains("Applicant opted for standard processing schedule", result.NotesForOfficer);
            Assert.Contains("Standard processing fee of LKR 10,000.00 assessed", result.Reasoning);
        }
    }
}
