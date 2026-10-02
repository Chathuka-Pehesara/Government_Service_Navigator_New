using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using AgenticAi.Agents.IntakePlanningAgent;
using Government_Service_Navigator.AgenticAi.Agents.EligibilityDocumentAgent;
using Government_Service_Navigator.AgenticAi.Agents.EligibilityDocumentAgent.DTOs;
using Government_Service_Navigator.AgenticAi.Agents.EligibilityDocumentAgent.Retrieval;
using Government_Service_Navigator.AgenticAi.Tools.CheckEligibilityRules;
using Government_Service_Navigator.AgenticAi.Tools.GetDocumentRequirements;
using Pgvector;
using Xunit;

namespace Government_Service_Navigator.AgenticAi.Tests
{
    public class IntakeAndEligibilityAgentTests
    {
        private const string PassportChunk =
            "Passport Renewal & Application (Immigration): To apply for this service, citizens must provide the following documents: National Identity Card, Old Passport, Birth Certificate. The applicable fees are: LKR 10000 for Standard Processing.";

        private const string VehicleChunk =
            "Vehicle Registration (Transport): To apply for this service, citizens must provide the following documents: Import Clearance, Insurance Certificate. The applicable fees are: LKR 5000 for Registration Fee.";

        private class StubEmbeddingService : IEmbeddingService
        {
            public Task<Vector> GetEmbeddingAsync(string text) => Task.FromResult(new Vector(new float[768]));
        }

        private class StubRetriever : IVectorRetriever, IEligibilityVectorRetriever
        {
            public List<string> Chunks { get; } = new();

            public Task<List<string>> GetRelevantContextAsync(Vector queryEmbedding, int limit, CancellationToken cancellationToken = default)
                => Task.FromResult(Chunks);

            public Task<List<string>> GetRelevantEligibilityContextAsync(Vector queryEmbedding, string? categoryFilter = null, int limit = 5, CancellationToken cancellationToken = default)
                => Task.FromResult(Chunks);
        }

        private class StubDocumentRepository : IDocumentRequirementRepository
        {
            public List<string> Names { get; } = new();
            public Task<List<string>> GetDocumentNamesAsync(int serviceProcedureId, int? stage = null, CancellationToken cancellationToken = default)
                => Task.FromResult(Names);
        }

        private readonly StubRetriever _retriever = new();

        [Fact]
        public void ServiceCatalogChunk_ParsesSeededFormat()
        {
            var chunk = ServiceCatalogChunk.TryParse(PassportChunk);

            Assert.NotNull(chunk);
            Assert.Equal("Passport Renewal & Application", chunk!.ServiceName);
            Assert.Equal("Immigration", chunk.Category);
            Assert.Equal(new[] { "National Identity Card", "Old Passport", "Birth Certificate" }, chunk.RequiredDocuments);
            Assert.Equal("LKR 10000 for Standard Processing", chunk.FeeText);
        }

        [Fact]
        public async Task Intake_PicksMatchingService_EvenWhenNotTopResult()
        {
            _retriever.Chunks.AddRange(new[] { VehicleChunk, PassportChunk });
            var agent = new IntakePlanningAgent(_retriever, new StubEmbeddingService());

            var plan = await agent.GeneratePlanAsync(new IntakePlanRequest("I need to renew my passports"));

            Assert.Equal("Passport Renewal & Application", plan.RecommendedService);
            Assert.Contains("Old Passport", plan.RequiredDocuments);
        }

        [Fact]
        public async Task Intake_UnrelatedRequest_ReturnsServiceNotFound()
        {
            _retriever.Chunks.Add(VehicleChunk);
            var agent = new IntakePlanningAgent(_retriever, new StubEmbeddingService());

            var plan = await agent.GeneratePlanAsync(new IntakePlanRequest("I want a marriage certificate"));

            Assert.Equal("Service Not Found", plan.RecommendedService);
            Assert.Empty(plan.RequiredDocuments);
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
        public async Task Intake_WithLlmService_ReturnsAiSynthesizedPlan()
        {
            _retriever.Chunks.Add(PassportChunk);
            var stubLlm = new StubLlmService
            {
                ResponseToReturn = """
                {
                    "recommendedService": "Passport Renewal & Application",
                    "requiredDocuments": ["Old Passport", "National Identity Card", "Police Lost Complaint Report"],
                    "stepByStepPlan": [
                        "Step 1: Obtain a police report for your lost document.",
                        "Step 2: Complete the online passport renewal form.",
                        "Step 3: Book an appointment at the Department of Immigration."
                    ]
                }
                """
            };

            var agent = new IntakePlanningAgent(_retriever, new StubEmbeddingService(), stubLlm);
            var plan = await agent.GeneratePlanAsync(new IntakePlanRequest("I lost my travel document in Colombo and need an urgent passport"));

            Assert.Equal("Passport Renewal & Application", plan.RecommendedService);
            Assert.Contains("Police Lost Complaint Report", plan.RequiredDocuments);
            Assert.Equal(3, plan.StepByStepPlan.Count);
            Assert.StartsWith("Step 1: Obtain a police report", plan.StepByStepPlan[0]);
        }

        [Fact]
        public async Task Eligibility_UsesCatalogDocuments_FlagsUnmatchedOnes_WithoutBlocking()
        {
            _retriever.Chunks.AddRange(new[] { VehicleChunk, PassportChunk });
            var agent = new EligibilityDocumentAgent(_retriever, new StubEmbeddingService(), new CheckEligibilityRulesTool(), new GetDocumentRequirementsTool(new StubDocumentRepository()));

            var result = await agent.EvaluateEligibilityAsync(new EligibilityPlanRequest(
                "Passport Renewal & Application",
                ServiceId: 1,
                Profile: new CitizenProfile { Age = 30, ProvidedDocuments = new() { "Required Document Upload: nic_front.jpg", "Required Document Upload: old passport.pdf" } }));

            Assert.True(result.IsEligible);
            Assert.Equal(new[] { "National Identity Card", "Old Passport", "Birth Certificate" }, result.RequiredDocuments);
            Assert.Equal(new[] { "Birth Certificate" }, result.MissingDocuments);
        }

        [Fact]
        public async Task Eligibility_ServiceNotVectorized_UsesCatalogRequirements_AndMatchesUploadByLabel()
        {
            var repository = new StubDocumentRepository();
            repository.Names.Add("NIC");
            var agent = new EligibilityDocumentAgent(_retriever, new StubEmbeddingService(), new CheckEligibilityRulesTool(), new GetDocumentRequirementsTool(repository));

            var result = await agent.EvaluateEligibilityAsync(new EligibilityPlanRequest(
                "Debug",
                ServiceId: 15,
                Profile: new CitizenProfile { Age = 21, ProvidedDocuments = new() { "NIC: Test.jpg" } }));

            Assert.Equal(new[] { "NIC" }, result.RequiredDocuments);
            Assert.Empty(result.MissingDocuments);
            Assert.Equal(100, result.MatchPercentage);
        }

        [Fact]
        public async Task Eligibility_WithLlmService_ReturnsAiSynthesizedEvaluation()
        {
            _retriever.Chunks.Add(PassportChunk);
            var stubLlm = new StubLlmService
            {
                ResponseToReturn = """
                {
                    "isEligible": true,
                    "matchPercentage": 85,
                    "missingCriteria": [],
                    "requiredDocuments": ["National Identity Card", "Old Passport", "Birth Certificate"],
                    "missingDocuments": ["Birth Certificate"],
                    "reasoning": "The applicant meets age and citizenship requirements. Valid NIC and Old Passport uploaded. Birth Certificate is still required."
                }
                """
            };

            var agent = new EligibilityDocumentAgent(
                _retriever, 
                new StubEmbeddingService(), 
                new CheckEligibilityRulesTool(), 
                new GetDocumentRequirementsTool(new StubDocumentRepository()),
                stubLlm);

            var result = await agent.EvaluateEligibilityAsync(new EligibilityPlanRequest(
                "Passport Renewal & Application",
                ServiceId: 1,
                Profile: new CitizenProfile { Age = 28, CitizenshipStatus = "Citizen", ProvidedDocuments = new() { "nic_scan.pdf", "old_passport.pdf" } }));

            // The LLM said eligible, but a mandatory document is still missing, so the code guardrail overrides it
            Assert.False(result.IsEligible);
            Assert.Equal(85, result.MatchPercentage);
            Assert.Empty(result.MissingCriteria);
            Assert.Contains("Birth Certificate", result.MissingDocuments);
            Assert.Contains("meets age and citizenship requirements", result.Reasoning);
        }
    }
}