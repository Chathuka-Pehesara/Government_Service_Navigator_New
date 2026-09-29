using Government_Service_Navigator.Backend.DTOs.Requests;
using Government_Service_Navigator.Backend.DTOs.Responses;
using Government_Service_Navigator.Backend.Services.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
using System.IdentityModel.Tokens.Jwt;

namespace Government_Service_Navigator.Backend.Controllers
{
    [ApiController]
    [Route("api/refunds")]
    public class RefundsController : ControllerBase
    {
        private const string FinanceRoles = "Finance Officer,Department Admin,Admin,System Admin";

        private readonly IRefundService _refundService;

        public RefundsController(IRefundService refundService)
        {
            _refundService = refundService;
        }

        private string GetUserEmail()
        {
            return User.FindFirstValue(ClaimTypes.Email)
                ?? User.FindFirstValue("email")
                ?? User.FindFirstValue(JwtRegisteredClaimNames.Email)
                ?? User.Identity?.Name
                ?? "unknown@user";
        }

        private bool IsSystemAdmin()
        {
            var role = User.FindFirstValue(ClaimTypes.Role) ?? string.Empty;
            return role.Contains("System Admin", StringComparison.OrdinalIgnoreCase) || role == "Admin";
        }

        private string? GetDepartment() => User.FindFirstValue("department");

        // Staff may only act on refunds for payments that belong to their own department.
        private async Task<bool> CanManageAsync(int refundId)
        {
            if (IsSystemAdmin()) return true;
            var dept = GetDepartment();
            return !string.IsNullOrWhiteSpace(dept) && await _refundService.IsInDepartmentAsync(refundId, dept);
        }

        // The citizen who asked for the refund, or staff of the payment's department.
        private async Task<bool> CanViewAsync(Models.Entities.RefundRequest refund)
        {
            if (string.Equals(refund.RequestedByEmail, GetUserEmail(), StringComparison.OrdinalIgnoreCase)) return true;
            var isFinanceStaff = FinanceRoles.Split(',').Any(User.IsInRole);
            return isFinanceStaff && await CanManageAsync(refund.Id);
        }

        // Finance Officer: list refund requests for their department, optionally filtered by status.
        [HttpGet]
        [Authorize(Roles = FinanceRoles)]
        public async Task<IActionResult> GetAll([FromQuery] string? status)
        {
            List<Models.Entities.RefundRequest> refunds;
            if (IsSystemAdmin())
            {
                refunds = await _refundService.GetAllAsync(status, null);
            }
            else
            {
                // A non-admin without a department claim sees nothing
                var dept = GetDepartment();
                refunds = string.IsNullOrWhiteSpace(dept)
                    ? new List<Models.Entities.RefundRequest>()
                    : await _refundService.GetAllAsync(status, dept);
            }
            return Ok(refunds.Select(RefundResponseDto.FromEntity));
        }

        // Citizen creates a refund request on a paid payment.
        [HttpPost]
        [Authorize]
        public async Task<IActionResult> Create([FromBody] CreateRefundRequestDto dto)
        {
            var email = GetUserEmail();
            try
            {
                var refund = await _refundService.CreateRefundRequestAsync(dto.PaymentId, dto.Reason, email);
                return CreatedAtAction(nameof(GetById), new { id = refund.Id }, RefundResponseDto.FromEntity(refund));
            }
            catch (KeyNotFoundException ex) { return NotFound(ex.Message); }
            catch (InvalidOperationException ex) { return BadRequest(ex.Message); }
        }

        [HttpGet("{id}")]
        [Authorize]
        public async Task<IActionResult> GetById(int id)
        {
            var refund = await _refundService.GetRefundByIdAsync(id);
            if (refund == null || !await CanViewAsync(refund)) return NotFound();
            return Ok(RefundResponseDto.FromEntity(refund));
        }

        [HttpGet("{id}/status")]
        [Authorize]
        public async Task<IActionResult> GetStatus(int id)
        {
            var refund = await _refundService.GetRefundByIdAsync(id);
            if (refund == null || !await CanViewAsync(refund)) return NotFound();
            return Ok(new { refund.Id, refund.Status });
        }

        // Citizen: list their own refund requests.
        [HttpGet("mine")]
        [Authorize]
        public async Task<IActionResult> GetMine()
        {
            var email = GetUserEmail();
            var refunds = await _refundService.GetByRequesterAsync(email);
            return Ok(refunds.Select(RefundResponseDto.FromEntity));
        }

        [HttpPost("{id}/approve")]
        [Authorize(Roles = FinanceRoles)]
        public async Task<IActionResult> Approve(int id, [FromBody] RefundDecisionDto dto)
        {
            if (!await CanManageAsync(id)) return NotFound();
            var email = GetUserEmail();
            try
            {
                var refund = await _refundService.ApproveAsync(id, email, dto.Note);
                return Ok(RefundResponseDto.FromEntity(refund));
            }
            catch (KeyNotFoundException ex) { return NotFound(ex.Message); }
            catch (InvalidOperationException ex) { return BadRequest(ex.Message); }
        }

        [HttpPost("{id}/reject")]
        [Authorize(Roles = FinanceRoles)]
        public async Task<IActionResult> Reject(int id, [FromBody] RefundDecisionDto dto)
        {
            if (!await CanManageAsync(id)) return NotFound();
            var email = GetUserEmail();
            try
            {
                var refund = await _refundService.RejectAsync(id, email, dto.Note);
                return Ok(RefundResponseDto.FromEntity(refund));
            }
            catch (KeyNotFoundException ex) { return NotFound(ex.Message); }
            catch (InvalidOperationException ex) { return BadRequest(ex.Message); }
        }

        [HttpPost("{id}/process")]
        [Authorize(Roles = FinanceRoles)]
        public async Task<IActionResult> Process(int id, [FromBody] RefundProcessDto dto)
        {
            if (!await CanManageAsync(id)) return NotFound();
            try
            {
                var refund = await _refundService.ProcessAsync(id, dto.TransactionRef);
                return Ok(RefundResponseDto.FromEntity(refund));
            }
            catch (KeyNotFoundException ex) { return NotFound(ex.Message); }
            catch (InvalidOperationException ex) { return BadRequest(ex.Message); }
            catch (ArgumentException ex) { return BadRequest(ex.Message); }
        }

        [HttpPost("{id}/complete")]
        [Authorize(Roles = FinanceRoles)]
        public async Task<IActionResult> Complete(int id)
        {
            if (!await CanManageAsync(id)) return NotFound();
            try
            {
                var refund = await _refundService.CompleteAsync(id);
                return Ok(RefundResponseDto.FromEntity(refund));
            }
            catch (KeyNotFoundException ex) { return NotFound(ex.Message); }
            catch (InvalidOperationException ex) { return BadRequest(ex.Message); }
        }
    }
}
