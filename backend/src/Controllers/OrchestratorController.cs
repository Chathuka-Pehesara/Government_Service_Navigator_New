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

        public OrchestratorController(IMasterSupervisorAgent supervisorAgent)
        {
            _supervisorAgent = supervisorAgent;
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
