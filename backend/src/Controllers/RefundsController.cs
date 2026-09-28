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

        // Finance Officer: list all refund requests, optionally filtered by status.
        [HttpGet]
        [Authorize]
        public async Task<IActionResult> GetAll([FromQuery] string? status)
        {
            var refunds = await _refundService.GetAllAsync(status);
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
                var refund = await _refundService.CreateRefundRequestAsync(dto.PaymentId, dto.RefundAmount, dto.Reason, email);
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
            if (refund == null) return NotFound();
            return Ok(RefundResponseDto.FromEntity(refund));
        }

        [HttpGet("{id}/status")]
        [Authorize]
        public async Task<IActionResult> GetStatus(int id)
        {
            var refund = await _refundService.GetRefundByIdAsync(id);
            if (refund == null) return NotFound();
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
        [Authorize]
        public async Task<IActionResult> Approve(int id, [FromBody] RefundDecisionDto dto)
        {
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
        [Authorize]
        public async Task<IActionResult> Reject(int id, [FromBody] RefundDecisionDto dto)
        {
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
        [Authorize]
        public async Task<IActionResult> Process(int id, [FromBody] RefundProcessDto dto)
        {
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
        [Authorize]
        public async Task<IActionResult> Complete(int id)
        {
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
