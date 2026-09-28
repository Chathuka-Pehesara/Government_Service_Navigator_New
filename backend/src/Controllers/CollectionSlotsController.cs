using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Government_Service_Navigator.Backend.Data.Context;
using System.ComponentModel.DataAnnotations;

namespace Government_Service_Navigator.Backend.Controllers
{
    [ApiController]
    [Route("api/admin/collection-slots")]
    [Authorize(Roles = "Admin,System Admin")]
    public class CollectionSlotsController : ControllerBase
    {
        private readonly AppDbContext _context;

        public CollectionSlotsController(AppDbContext context)
        {
            _context = context;
        }

        [HttpGet]
        public async Task<IActionResult> GetAllSlots()
        {
            var slots = await _context.Database.SqlQueryRaw<CollectionTimeSlot>(
                "SELECT * FROM \"CollectionTimeSlots\" ORDER BY \"DayOfWeek\", \"StartTime\"").ToListAsync();
            return Ok(slots);
        }

        [HttpPost]
        public async Task<IActionResult> CreateSlot([FromBody] CollectionTimeSlotDto dto)
        {
            if (dto.DayOfWeek < 1 || dto.DayOfWeek > 6)
                return BadRequest("DayOfWeek must be between 1 (Monday) and 6 (Saturday). Sundays are holidays.");

            var sql = "INSERT INTO \"CollectionTimeSlots\" (\"DayOfWeek\", \"StartTime\", \"EndTime\", \"MaxCapacity\", \"IsActive\") VALUES ({0}, {1}, {2}, {3}, {4})";
            await _context.Database.ExecuteSqlRawAsync(sql, dto.DayOfWeek, dto.StartTime, dto.EndTime, dto.MaxCapacity, dto.IsActive);
            
            return Ok(new { message = "Time slot created successfully." });
        }

        [HttpPut("{id}")]
        public async Task<IActionResult> UpdateSlot(int id, [FromBody] CollectionTimeSlotDto dto)
        {
            if (dto.DayOfWeek < 1 || dto.DayOfWeek > 6)
                return BadRequest("DayOfWeek must be between 1 (Monday) and 6 (Saturday). Sundays are holidays.");

            var sql = "UPDATE \"CollectionTimeSlots\" SET \"DayOfWeek\" = {0}, \"StartTime\" = {1}, \"EndTime\" = {2}, \"MaxCapacity\" = {3}, \"IsActive\" = {4} WHERE \"Id\" = {5}";
            await _context.Database.ExecuteSqlRawAsync(sql, dto.DayOfWeek, dto.StartTime, dto.EndTime, dto.MaxCapacity, dto.IsActive, id);
            
            return Ok(new { message = "Time slot updated." });
        }

        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteSlot(int id)
        {
            var sql = "DELETE FROM \"CollectionTimeSlots\" WHERE \"Id\" = {0}";
            await _context.Database.ExecuteSqlRawAsync(sql, id);
            return Ok(new { message = "Time slot deleted." });
        }
    }

    public class CollectionTimeSlot
    {
        public int Id { get; set; }
        public int DayOfWeek { get; set; }
        public TimeSpan StartTime { get; set; }
        public TimeSpan EndTime { get; set; }
        public int MaxCapacity { get; set; }
        public bool IsActive { get; set; }
    }

    public class CollectionTimeSlotDto
    {
        [Range(1, 6)]
        public int DayOfWeek { get; set; }
        public TimeSpan StartTime { get; set; }
        public TimeSpan EndTime { get; set; }
        public int MaxCapacity { get; set; } = 5;
        public bool IsActive { get; set; } = true;
    }
}
