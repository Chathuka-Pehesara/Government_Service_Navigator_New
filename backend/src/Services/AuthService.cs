using System;
using System.IdentityModel.Tokens.Jwt;
using System.Linq;
using System.Security.Claims;
using System.Text;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;
using Government_Service_Navigator.Backend.Data.Context;
using Government_Service_Navigator.Backend.DTOs.Requests;
using Government_Service_Navigator.Backend.DTOs.Responses;
using Government_Service_Navigator.Backend.Models.Entities;
using Government_Service_Navigator.Backend.Services.Interfaces;
using Government_Service_Navigator.Backend.Validation;
using BCrypt.Net;

namespace Government_Service_Navigator.Backend.Services
{
    public class AuthService : IAuthService
    {
        private readonly AppDbContext _context;
        private readonly IConfiguration _configuration;
        private readonly TokenRevocationStore _revocation;

        public AuthService(AppDbContext context, IConfiguration configuration, TokenRevocationStore revocation)
        {
            _context = context;
            _configuration = configuration;
            _revocation = revocation;
        }

        public async Task<AuthResponse> RegisterAsync(RegisterRequest request)
        {
            var email = request.Email.Trim().ToLowerInvariant();
            var nic = SriLankaNic.Normalize(request.NicNumber);

            if (await _context.Users.AnyAsync(u => u.Email.ToLower() == email))
            {
                return new AuthResponse { Success = false, ErrorMessage = "User with this email already exists." };
            }

            // One account per citizen: the NIC identifies their applications and bookings
            if (await _context.Users.AnyAsync(u => u.NicNumber.ToUpper() == nic))
            {
                return new AuthResponse { Success = false, ErrorMessage = "An account with this NIC number already exists." };
            }

            var user = new User
            {
                Email = email,
                FullName = request.FullName.Trim(),
                NicNumber = nic,
                PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password)
            };

            _context.Users.Add(user);
            await _context.SaveChangesAsync();

            var token = GenerateJwtToken(user);

            return new AuthResponse
            {
                Success = true,
                Token = token,
                User = new UserDto
                {
                    Email = user.Email,
                    FullName = user.FullName,
                    NicNumber = user.NicNumber,
                    Role = user.Role
                }
            };
        }

        public async Task<AuthResponse> LoginAsync(LoginRequest request)
        {
            var email = request.Email.Trim().ToLowerInvariant();
            var user = await _context.Users.FirstOrDefaultAsync(u => u.Email.ToLower() == email);

            if (user == null || !BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash))
            {
                return new AuthResponse { Success = false, ErrorMessage = "Invalid email or password." };
            }

            var token = GenerateJwtToken(user);

            return new AuthResponse
            {
                Success = true,
                Token = token,
                User = new UserDto
                {
                    Email = user.Email,
                    FullName = user.FullName,
                    NicNumber = user.NicNumber,
                    Role = user.Role
                }
            };
        }

        public async Task<AuthResponse> OfficerLoginAsync(LoginRequest request) 
        {
            var officer = await _context.Officers.FirstOrDefaultAsync(o => o.Email == request.Email);
            
            if (officer == null || !BCrypt.Net.BCrypt.Verify(request.Password, officer.PasswordHash)) {
                return new AuthResponse {
                    Success = false,
                    ErrorMessage = "Invalid email or password."
                };
            }
            
            var token = GenerateJwtTokenForOfficer(officer);
            
            return new AuthResponse {
                Success = true, 
                Token = token,
                Officer = new OfficerDto {
                    Email = officer.Email,
                    FullName = officer.Name,
                    Department = officer.Department,
                    Role = officer.Role
                }
            };
        }
        public async Task<AuthResponse> AdminLoginAsync(LoginRequest request) 
        {
            var admin = await _context.Admins.FirstOrDefaultAsync(a => a.Email == request.Email);
            
            if (admin == null || !BCrypt.Net.BCrypt.Verify(request.Password, admin.PasswordHash)) {
                return new AuthResponse {
                    Success = false,
                    ErrorMessage = "Invalid email or password."
                };
            }
            
            var token = GenerateJwtTokenForAdmin(admin);
            
            return new AuthResponse {
                Success = true, 
                Token = token,
                Admin = new AdminDto {
                    Email = admin.Email,
                    Role = admin.Role
                }
            };
        }

        public async Task LogoutAsync(string jti, DateTime expiresAt)
        {
            if (string.IsNullOrEmpty(jti))
            {
                return;
            }

            var alreadyRevoked = await _context.RevokedTokens.AnyAsync(t => t.Jti == jti);
            if (!alreadyRevoked)
            {
                _context.RevokedTokens.Add(new RevokedToken
                {
                    Jti = jti,
                    ExpiresAt = expiresAt
                });
            }

            // Opportunistically prune tokens that have already expired naturally,
            // since they no longer need to be tracked as revoked.
            var expiredTokens = _context.RevokedTokens.Where(t => t.ExpiresAt < DateTime.UtcNow);
            _context.RevokedTokens.RemoveRange(expiredTokens);

            await _context.SaveChangesAsync();

            // Write-through to the fast revocation check used on every request
            await _revocation.RevokeAsync(jti, expiresAt);
        }

        private string GenerateJwtToken(User user)
        {
            var keyStr = _configuration["Jwt:Key"] ?? Environment.GetEnvironmentVariable("JWT_KEY");
            var issuer = _configuration["Jwt:Issuer"] ?? Environment.GetEnvironmentVariable("JWT_ISSUER");
            var audience = _configuration["Jwt:Audience"] ?? Environment.GetEnvironmentVariable("JWT_AUDIENCE");
            
            if (string.IsNullOrEmpty(keyStr))
                throw new Exception("JWT Key is not configured.");

            var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(keyStr));
            var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

            var claims = new[]
            {
                new Claim(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
                new Claim(JwtRegisteredClaimNames.Email, user.Email),
                new Claim(ClaimTypes.Role, user.Role),
                new Claim("fullName", user.FullName),
                new Claim("nicNumber", user.NicNumber),
                new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString())
            };

            var token = new JwtSecurityToken(
                issuer: issuer,
                audience: audience,
                claims: claims,
                expires: DateTime.UtcNow.AddDays(7),
                signingCredentials: creds
            );

            return new JwtSecurityTokenHandler().WriteToken(token);
        }

        private string GenerateJwtTokenForOfficer(Officer officer)
        {
            var keyStr = _configuration["Jwt:Key"] ?? Environment.GetEnvironmentVariable("JWT_KEY");
            var issuer = _configuration["Jwt:Issuer"] ?? Environment.GetEnvironmentVariable("JWT_ISSUER");
            var audience = _configuration["Jwt:Audience"] ?? Environment.GetEnvironmentVariable("JWT_AUDIENCE");
            
            if (string.IsNullOrEmpty(keyStr))
                throw new Exception("JWT Key is not configured.");

            var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(keyStr));
            var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

            var claims = new[]
            {
                new Claim(JwtRegisteredClaimNames.Sub, officer.Id.ToString()),
                new Claim(JwtRegisteredClaimNames.Email, officer.Email),
                new Claim(ClaimTypes.Role, officer.Role),
                new Claim("department", officer.Department),
                new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString())
            };

            var token = new JwtSecurityToken(
                issuer: issuer,
                audience: audience,
                claims: claims,
                expires: DateTime.UtcNow.AddDays(7),
                signingCredentials: creds
            );

            return new JwtSecurityTokenHandler().WriteToken(token);
        }

        private string GenerateJwtTokenForAdmin(Admin admin)
        {
            var keyStr = _configuration["Jwt:Key"] ?? Environment.GetEnvironmentVariable("JWT_KEY");
            var issuer = _configuration["Jwt:Issuer"] ?? Environment.GetEnvironmentVariable("JWT_ISSUER");
            var audience = _configuration["Jwt:Audience"] ?? Environment.GetEnvironmentVariable("JWT_AUDIENCE");
            
            if (string.IsNullOrEmpty(keyStr))
                throw new Exception("JWT Key is not configured.");

            var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(keyStr));
            var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

            var claims = new[]
            {
                new Claim(JwtRegisteredClaimNames.Sub, admin.Id.ToString()),
                new Claim(JwtRegisteredClaimNames.Email, admin.Email),
                new Claim(ClaimTypes.Role, admin.Role),
                new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString())
            };

            var token = new JwtSecurityToken(
                issuer: issuer,
                audience: audience,
                claims: claims,
                expires: DateTime.UtcNow.AddDays(7),
                signingCredentials: creds
            );

            return new JwtSecurityTokenHandler().WriteToken(token);
        }
    }
}