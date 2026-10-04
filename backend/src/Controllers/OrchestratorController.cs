using System.Threading;
using System.Threading.Tasks;
using Government_Service_Navigator.AgenticAi.Orchestration;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Government_Service_Navigator.Backend.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class OrchestratorController : ControllerBase
    {
        private readonly IMasterSupervisorAgent _supervisorAgent;
        private readonly Government_Service_Navigator.AgenticAi.Orchestration.Workflows.ICitizenApplicationWorkflow _citizenWorkflow;
        private readonly Government_Service_Navigator.AgenticAi.Orchestration.Workflows.IOfficerVerificationWorkflow _officerWorkflow;

        public OrchestratorController(
            IMasterSupervisorAgent supervisorAgent,
            Government_Service_Navigator.AgenticAi.Orchestration.Workflows.ICitizenApplicationWorkflow citizenWorkflow,
            Government_Service_Navigator.AgenticAi.Orchestration.Workflows.IOfficerVerificationWorkflow officerWorkflow)
        {
            _supervisorAgent = supervisorAgent;
            _citizenWorkflow = citizenWorkflow;
            _officerWorkflow = officerWorkflow;
        }

        /// <summary>
        /// Interactive Chat with the Master Supervisor Agent.
        /// Coordinates across Agent 1, Agent 2, Agent 3, and Agent 4.
        /// Context-aware tone: Authoritative/Statutory for Web Officers, Helpful/Reassuring for Mobile Citizens.
        /// </summary>
        [HttpPost("chat")]
        public async Task<IActionResult> Chat([FromBody] SupervisorChatRequest request, CancellationToken cancellationToken)
        {
            if (string.IsNullOrWhiteSpace(request.Query))
            {
                return BadRequest(new { message = "Query cannot be empty." });
            }

            var response = await _supervisorAgent.ProcessChatQueryAsync(request, cancellationToken);
            return Ok(response);
        }

        /// <summary>
        /// Executes Workflow 1: End-to-End Citizen Pre-Application & Submission Pipeline.
        /// Coordinates Agent 1 (Intake) -> Agent 2 (Eligibility) -> Agent 3 (Drafting) -> Agent 4 (Safety).
        /// </summary>
        [HttpPost("workflows/citizen-pipeline")]
        public async Task<IActionResult> RunCitizenPipeline(
            [FromBody] Government_Service_Navigator.AgenticAi.Orchestration.Workflows.CitizenApplicationWorkflowRequest request,
            CancellationToken cancellationToken)
        {
            if (string.IsNullOrWhiteSpace(request.UserNeedDescription) && string.IsNullOrWhiteSpace(request.CitizenNic))
            {
                return BadRequest(new { message = "Citizen NIC or description of need is required." });
            }

            var state = await _citizenWorkflow.ExecutePipelineAsync(request, cancellationToken);
            return Ok(state);
        }

        /// <summary>
        /// Executes Workflow 2: Statutory Officer Verification & Multi-Stage Approval Pipeline.
        /// Coordinates Agent 1 (Audit) -> Agent 2 (Evidentiary) -> Agent 3 (Settlement) -> Agent 4 (Dossier & Decision Order).
        /// </summary>
        [HttpPost("workflows/officer-verification")]
        [Authorize(Roles = "Verification Officer,Department Admin,SuperAdmin")]
        public async Task<IActionResult> RunOfficerVerification(
            [FromBody] Government_Service_Navigator.AgenticAi.Orchestration.Workflows.OfficerVerificationWorkflowRequest request,
            CancellationToken cancellationToken)
        {
            var state = await _officerWorkflow.ExecuteVerificationPipelineAsync(request, cancellationToken);
            return Ok(state);
        }

        /// <summary>
        /// Quick statutory pre-audit of an application case by the Master Supervisor.
        /// </summary>
        [HttpGet("audit-case/{applicationId}")]
        [Authorize(Roles = "Verification Officer,Department Admin,SuperAdmin")]
        public async Task<IActionResult> AuditCase(int applicationId, [FromQuery] int? stage, CancellationToken cancellationToken)
        {
            var request = new SupervisorChatRequest
            {
                ApplicationId = applicationId,
                Stage = stage,
                PlatformContext = "web",
                Query = "Perform comprehensive statutory compliance, evidentiary verification, and safety audit for this application."
            };

            var response = await _supervisorAgent.ProcessChatQueryAsync(request, cancellationToken);
            return Ok(response);
        }
    }
}
