using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using MediaHouse.Data;
using MediaHouse.Data.Entities;
using MediaHouse.DTOs;
using MediaHouse.Interfaces;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

namespace MediaHouse.Services;

public class AuthService(
    MediaHouseDbContext context,
    IOptions<JwtSettings> jwtSettings,
    ILogger<AuthService> logger) : IAuthService
{
    private readonly MediaHouseDbContext _context = context;
    private readonly JwtSettings _jwtSettings = jwtSettings.Value;
    private readonly ILogger<AuthService> _logger = logger;

    public async Task<string?> LoginAsync(string username, string password)
    {
        // Find user by username
        var user = await _context.AppUsers
            .FirstOrDefaultAsync(u => u.Username == username);

        if (user == null)
        {
            _logger.LogWarning("Login failed: User not found for username {Username}", username);
            return null;
        }

        if (!user.IsActive)
        {
            _logger.LogWarning("Login failed: User {Username} is inactive", username);
            return null;
        }

        // Verify password
        if (!VerifyPassword(password, user.PasswordHash))
        {
            _logger.LogWarning("Login failed: Invalid password for user {Username}", username);
            return null;
        }

        // Generate JWT token
        var token = GenerateJwtToken(user.Id, user.Username);
        _logger.LogInformation("User {Username} logged in successfully", username);

        return token;
    }

    public async Task<RegisterResponseDto?> RegisterAsync(string username, string password, string? email)
    {
        // Validate username
        if (string.IsNullOrWhiteSpace(username) || username.Length < 3)
        {
            _logger.LogWarning("Registration failed: Username too short");
            return null;
        }

        // Validate password
        if (string.IsNullOrWhiteSpace(password) || password.Length < 6)
        {
            _logger.LogWarning("Registration failed: Password too short");
            return null;
        }

        // Check if username already exists
        var existingUser = await _context.AppUsers
            .FirstOrDefaultAsync(u => u.Username == username);

        if (existingUser != null)
        {
            _logger.LogWarning("Registration failed: Username already exists {Username}", username);
            return null;
        }

        // Hash password
        var passwordHash = HashPassword(password);

        // Create new user
        var user = new AppUser
        {
            Username = username,
            PasswordHash = passwordHash,
            Email = email,
            IsActive = true,
            CreateTime = DateTime.UtcNow,
            UpdateTime = DateTime.UtcNow
        };

        _context.AppUsers.Add(user);
        await _context.SaveChangesAsync();

        _logger.LogInformation("User {Username} registered successfully", username);

        return new RegisterResponseDto
        {
            UserId = user.Id,
            Username = user.Username
        };
    }

    public string GenerateJwtToken(int userId, string username)
    {
        var tokenHandler = new JwtSecurityTokenHandler();
        var key = Encoding.ASCII.GetBytes(_jwtSettings.Secret);

        var claims = new[]
        {
            new Claim(ClaimTypes.NameIdentifier, userId.ToString()),
            new Claim(ClaimTypes.Name, username),
            new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString())
        };

        var tokenDescriptor = new SecurityTokenDescriptor
        {
            Subject = new ClaimsIdentity(claims),
            Expires = DateTime.UtcNow.AddMinutes(_jwtSettings.ExpirationMinutes),
            SigningCredentials = new SigningCredentials(
                new SymmetricSecurityKey(key),
                SecurityAlgorithms.HmacSha256Signature),
            Issuer = _jwtSettings.Issuer,
            Audience = _jwtSettings.Audience
        };

        var token = tokenHandler.CreateToken(tokenDescriptor);
        return tokenHandler.WriteToken(token);
    }

    public string HashPassword(string password)
    {
        // Generate a random salt
        byte[] salt = new byte[16];
        using (var rng = RandomNumberGenerator.Create())
        {
            rng.GetBytes(salt);
        }

        // Hash password with PBKDF2 using modern API
        byte[] hash = Rfc2898DeriveBytes.Pbkdf2(password, salt, 10000, HashAlgorithmName.SHA256, 32);

        // Combine salt and hash
        byte[] hashBytes = new byte[48];
        Array.Copy(salt, 0, hashBytes, 0, 16);
        Array.Copy(hash, 0, hashBytes, 16, 32);

        return Convert.ToBase64String(hashBytes);
    }

    public bool VerifyPassword(string password, string hash)
    {
        try
        {
            byte[] hashBytes = Convert.FromBase64String(hash);

            // Extract salt and hash
            byte[] salt = new byte[16];
            byte[] storedHash = new byte[32];
            Array.Copy(hashBytes, 0, salt, 0, 16);
            Array.Copy(hashBytes, 16, storedHash, 0, 32);

            // Hash input password with same salt using modern API
            byte[] computedHash = Rfc2898DeriveBytes.Pbkdf2(password, salt, 10000, HashAlgorithmName.SHA256, 32);

            // Compare hashes
            return computedHash.SequenceEqual(storedHash);
        }
        catch
        {
            return false;
        }
    }
}

public class JwtSettings
{
    public const string SectionName = "Jwt";
    public string Secret { get; set; } = string.Empty;
    public string Issuer { get; set; } = string.Empty;
    public string Audience { get; set; } = string.Empty;
    public int ExpirationMinutes { get; set; } = 60;
}
