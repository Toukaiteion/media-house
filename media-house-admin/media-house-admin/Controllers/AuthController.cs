using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MediaHouse.DTOs;
using MediaHouse.Interfaces;

namespace MediaHouse.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController(
    IAuthService authService,
    ILogger<AuthController> logger) : ControllerBase
{
    private readonly IAuthService _authService = authService;
    private readonly ILogger<AuthController> _logger = logger;

    [HttpPost("login")]
    [AllowAnonymous]
    public async Task<ActionResult<LoginResponseDto>> Login([FromBody] LoginRequestDto request)
    {
        try
        {
            if (string.IsNullOrEmpty(request.Username) || string.IsNullOrEmpty(request.Password))
            {
                return BadRequest(new { error = "Username and password are required" });
            }

            var token = await _authService.LoginAsync(request.Username, request.Password);

            if (string.IsNullOrEmpty(token))
            {
                return Unauthorized(new { error = "Invalid username or password" });
            }

            return Ok(new LoginResponseDto
            {
                Token = token,
                TokenType = "Bearer"
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error during login for user {Username}", request.Username);
            return StatusCode(500, new { error = "Login failed" });
        }
    }

    [HttpPost("register")]
    [AllowAnonymous]
    public async Task<ActionResult<RegisterResponseDto>> Register([FromBody] RegisterRequestDto request)
    {
        try
        {
            if (string.IsNullOrEmpty(request.Username) || string.IsNullOrEmpty(request.Password))
            {
                return BadRequest(new { error = "Username and password are required" });
            }

            if (request.Username.Length < 3)
            {
                return BadRequest(new { error = "Username must be at least 3 characters long" });
            }

            if (request.Password.Length < 6)
            {
                return BadRequest(new { error = "Password must be at least 6 characters long" });
            }

            var result = await _authService.RegisterAsync(request.Username, request.Password, request.Email);

            if (result == null)
            {
                return Conflict(new { error = "Username already exists" });
            }

            return CreatedAtAction(nameof(Login), new { username = result.Username }, result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error during registration for user {Username}", request.Username);
            return StatusCode(500, new { error = "Registration failed" });
        }
    }
}
