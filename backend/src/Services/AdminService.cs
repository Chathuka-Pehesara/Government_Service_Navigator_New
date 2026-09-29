using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Government_Service_Navigator.Backend.Data.Context;
using Government_Service_Navigator.Backend.DTOs.Requests;
using Government_Service_Navigator.Backend.DTOs.Responses;
using Government_Service_Navigator.Backend.Models.Entities;
using Government_Service_Navigator.Backend.Services.Interfaces;

namespace Government_Service_Navigator.Backend.Services
{
    public class AdminService : IAdminService 
    {
        private readonly AppDbContext _context;
        
        public AdminService(AppDbContext context) {
            _context = context;
        }

        public async Task<IEnumerable<OfficerDetailsDto>> GetAllOfficersAsync(string? department = null) {
            var query = _context.Officers.AsQueryable();
            if (!string.IsNullOrWhiteSpace(department)) {
                query = query.Where(o => o.Department == department);
            }
            var officers = await query.ToListAsync();
            return officers.Select(o => new OfficerDetailsDto {
                Id = o.Id.ToString(),
                Name = o.Name,
                Email = o.Email,
                Role = o.Role,
                Department = o.Department,
                Status = o.Status
            });
        }
        public async Task<AuthResponse> CreateOfficerAsync(CreateOfficerRequest request) {
            var email = request.Email.Trim().ToLower();
            if (await _context.Officers.AnyAsync(o => o.Email.ToLower() == email)) {
                return new AuthResponse {
                    Success = false,
                    ErrorMessage = "Officer with this email already exists."
                };
            }
            var officer = new Officer {
                Name = request.FullName,
                Email = request.Email,
                Role = request.Role,
                Department = request.Department,
                Status = "Active",
                PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password) 
            };
            _context.Officers.Add(officer);
            await _context.SaveChangesAsync();

            return new AuthResponse {
                Success = true,
                Officer = new OfficerDto {
                    Email = officer.Email,
                    Role = officer.Role,
                }
            };
        }
        public async Task<bool> UpdateOfficerAsync(int id,UpdateOfficerRequest request) {
            var officer = await _context.Officers.FindAsync(id);
            if (officer ==null) return false;

            officer.Name = request.FullName;
            officer.Department = request.Department;
            officer.Role = request.Role;
            await _context.SaveChangesAsync();
            return true;
        }
        public async Task<bool> ResetOfficerPasswordAsync(int id, ResetPasswordRequest request) {
            var officer = await _context.Officers.FindAsync(id);
            if (officer == null) return false;

            officer.PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.NewPassword);
            await _context.SaveChangesAsync();
            return true;
        }
        public async Task<bool> UpdateOfficerStatusAsync(int id, string status) {
            var officer = await _context.Officers.FindAsync(id);
            if(officer ==null) return false;

            officer.Status = status;
            await _context.SaveChangesAsync();
            return true;
        }
    }
}