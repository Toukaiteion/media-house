using MediaHouse.DTOs;

namespace MediaHouse.Interfaces;

public interface IAuthService
{
    Task<string?> LoginAsync(string username, string password);
    Task<RegisterResponseDto?> RegisterAsync(string username, string password, string? email);
    string GenerateJwtToken(int userId, string username);
    string HashPassword(string password);
    bool VerifyPassword(string password, string hash);
}
