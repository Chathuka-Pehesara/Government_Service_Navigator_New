using System;
using System.Linq;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Government_Service_Navigator.Backend.Data.Context;
using Government_Service_Navigator.Backend.Models.Entities;

namespace Government_Service_Navigator.Backend.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class DepartmentsController : ControllerBase
    {
        private readonly AppDbContext _context;

        public DepartmentsController(AppDbContext context)
        {
            _context = context;
        }

        // GET: api/departments
        [HttpGet]
        public async Task<IActionResult> GetAllDepartments([FromQuery] string? search = null, [FromQuery] string? status = null)
        {
            var query = _context.Departments.AsQueryable();

            if (!string.IsNullOrWhiteSpace(status) && status.ToLower() != "all")
            {
                query = query.Where(d => d.Status.ToLower() == status.ToLower());
            }

            if (!string.IsNullOrWhiteSpace(search))
            {
                var term = search.Trim().ToLower();
                query = query.Where(d =>
                    d.Name.ToLower().Contains(term) ||
                    d.DepartmentCode.ToLower().Contains(term) ||
                    (d.Category != null && d.Category.ToLower().Contains(term)) ||
                    (d.ContactNumber != null && d.ContactNumber.ToLower().Contains(term)) ||
                    (d.Email != null && d.Email.ToLower().Contains(term))
                );
            }

            var departments = await query.OrderBy(d => d.Id).ToListAsync();

            // Enrich with active officer count and linked services
            var officerCounts = await _context.Officers
                .GroupBy(o => o.Department)
                .Select(g => new { Department = g.Key, Count = g.Count() })
                .ToDictionaryAsync(x => x.Department, x => x.Count);

            var result = departments.Select(d => new
            {
                d.Id,
                d.DepartmentCode,
                d.Name,
                d.Category,
                d.LogoUrl,
                d.ContactNumber,
                d.Email,
                d.Website,
                d.Address,
                d.Description,
                d.Status,
                d.CreatedAt,
                d.UpdatedAt,
                OfficerCount = officerCounts.ContainsKey(d.Name) ? officerCounts[d.Name] : 0
            });

            return Ok(result);
        }

        // GET: api/departments/next-code
        [HttpGet("next-code")]
        public async Task<IActionResult> GetNextDepartmentCode()
        {
            var nextCode = await GenerateNextCodeAsync();
            return Ok(new { nextCode });
        }

        // GET: api/departments/{id}
        [HttpGet("{id}")]
        public async Task<IActionResult> GetDepartmentById(int id)
        {
            var department = await _context.Departments.FindAsync(id);
            if (department == null)
            {
                return NotFound(new { message = $"Department with ID {id} not found." });
            }
            return Ok(department);
        }

        // POST: api/departments
        [HttpPost]
        public async Task<IActionResult> CreateDepartment([FromBody] DepartmentCreateDto dto)
        {
            if (string.IsNullOrWhiteSpace(dto.Name))
            {
                return BadRequest(new { message = "Department Name is required." });
            }

            // Check if name already exists
            var trimmedName = dto.Name.Trim();
            var nameExists = await _context.Departments.AnyAsync(d => d.Name.ToLower() == trimmedName.ToLower());
            if (nameExists)
            {
                return BadRequest(new { message = $"A department with the name '{trimmedName}' already exists." });
            }

            // Auto-generate code if empty or invalid
            string code = string.IsNullOrWhiteSpace(dto.DepartmentCode)
                ? await GenerateNextCodeAsync()
                : dto.DepartmentCode.Trim().ToUpper();

            // Check if code already exists
            var codeExists = await _context.Departments.AnyAsync(d => d.DepartmentCode.ToUpper() == code);
            if (codeExists)
            {
                // If provided code is taken, generate a guaranteed unique one
                code = await GenerateNextCodeAsync();
            }

            var department = new Department
            {
                DepartmentCode = code,
                Name = trimmedName,
                Category = string.IsNullOrWhiteSpace(dto.Category) ? "General" : dto.Category.Trim(),
                LogoUrl = dto.LogoUrl?.Trim(),
                ContactNumber = dto.ContactNumber?.Trim(),
                Email = dto.Email?.Trim(),
                Website = dto.Website?.Trim(),
                Address = dto.Address?.Trim(),
                Description = dto.Description?.Trim(),
                Status = string.IsNullOrWhiteSpace(dto.Status) ? "Active" : dto.Status.Trim(),
                CreatedAt = DateTime.UtcNow
            };

            _context.Departments.Add(department);
            await _context.SaveChangesAsync();

            return CreatedAtAction(nameof(GetDepartmentById), new { id = department.Id }, department);
        }

        // PUT: api/departments/{id}
        [HttpPut("{id}")]
        public async Task<IActionResult> UpdateDepartment(int id, [FromBody] DepartmentUpdateDto dto)
        {
            var department = await _context.Departments.FindAsync(id);
            if (department == null)
            {
                return NotFound(new { message = $"Department with ID {id} not found." });
            }

            if (!string.IsNullOrWhiteSpace(dto.Name))
            {
                var trimmedName = dto.Name.Trim();
                var nameExists = await _context.Departments.AnyAsync(d => d.Id != id && d.Name.ToLower() == trimmedName.ToLower());
                if (nameExists)
                {
                    return BadRequest(new { message = $"A department with the name '{trimmedName}' already exists." });
                }
                department.Name = trimmedName;
            }

            if (!string.IsNullOrWhiteSpace(dto.DepartmentCode))
            {
                var trimmedCode = dto.DepartmentCode.Trim().ToUpper();
                var codeExists = await _context.Departments.AnyAsync(d => d.Id != id && d.DepartmentCode.ToUpper() == trimmedCode);
                if (codeExists)
                {
                    return BadRequest(new { message = $"Department code '{trimmedCode}' is already in use." });
                }
                department.DepartmentCode = trimmedCode;
            }

            if (dto.Category != null) department.Category = dto.Category.Trim();
            if (dto.LogoUrl != null) department.LogoUrl = dto.LogoUrl.Trim();
            if (dto.ContactNumber != null) department.ContactNumber = dto.ContactNumber.Trim();
            if (dto.Email != null) department.Email = dto.Email.Trim();
            if (dto.Website != null) department.Website = dto.Website.Trim();
            if (dto.Address != null) department.Address = dto.Address.Trim();
            if (dto.Description != null) department.Description = dto.Description.Trim();
            if (!string.IsNullOrWhiteSpace(dto.Status)) department.Status = dto.Status.Trim();
            department.UpdatedAt = DateTime.UtcNow;

            await _context.SaveChangesAsync();
            return Ok(department);
        }

        // PATCH: api/departments/{id}/status
        [HttpPatch("{id}/status")]
        public async Task<IActionResult> ToggleStatus(int id, [FromBody] DepartmentStatusDto dto)
        {
            var department = await _context.Departments.FindAsync(id);
            if (department == null)
            {
                return NotFound(new { message = $"Department with ID {id} not found." });
            }

            department.Status = string.IsNullOrWhiteSpace(dto.Status)
                ? (department.Status == "Active" ? "Inactive" : "Active")
                : dto.Status.Trim();
            department.UpdatedAt = DateTime.UtcNow;

            await _context.SaveChangesAsync();
            return Ok(new { department.Id, department.Status });
        }

        // DELETE: api/departments/{id}
        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteDepartment(int id)
        {
            var department = await _context.Departments.FindAsync(id);
            if (department == null)
            {
                return NotFound(new { message = $"Department with ID {id} not found." });
            }

            // Check if department is associated with any officers
            var hasOfficers = await _context.Officers.AnyAsync(o => o.Department.ToLower() == department.Name.ToLower());
            if (hasOfficers)
            {
                return BadRequest(new { message = "Cannot delete department because active officers are assigned to it. Deactivate the department instead." });
            }

            _context.Departments.Remove(department);
            await _context.SaveChangesAsync();
            return Ok(new { message = "Department deleted successfully." });
        }

        // Helper to generate next sequential DepartmentCode (DEP-001, DEP-002, ...)
        private async Task<string> GenerateNextCodeAsync()
        {
            var codes = await _context.Departments
                .Select(d => d.DepartmentCode)
                .ToListAsync();

            int maxNumber = 0;
            var regex = new Regex(@"DEP-(\d+)", RegexOptions.IgnoreCase);

            foreach (var code in codes)
            {
                var match = regex.Match(code);
                if (match.Success && int.TryParse(match.Groups[1].Value, out int num))
                {
                    if (num > maxNumber) maxNumber = num;
                }
            }

            int nextNum = maxNumber > 0 ? maxNumber + 1 : codes.Count + 1;
            return $"DEP-{nextNum:D3}";
        }
    }

    public class DepartmentCreateDto
    {
        public string? DepartmentCode { get; set; }
        public string Name { get; set; } = string.Empty;
        public string? Category { get; set; }
        public string? LogoUrl { get; set; }
        public string? ContactNumber { get; set; }
        public string? Email { get; set; }
        public string? Website { get; set; }
        public string? Address { get; set; }
        public string? Description { get; set; }
        public string? Status { get; set; } = "Active";
    }

    public class DepartmentUpdateDto
    {
        public string? DepartmentCode { get; set; }
        public string? Name { get; set; }
        public string? Category { get; set; }
        public string? LogoUrl { get; set; }
        public string? ContactNumber { get; set; }
        public string? Email { get; set; }
        public string? Website { get; set; }
        public string? Address { get; set; }
        public string? Description { get; set; }
        public string? Status { get; set; }
    }

    public class DepartmentStatusDto
    {
        public string? Status { get; set; }
    }
}
