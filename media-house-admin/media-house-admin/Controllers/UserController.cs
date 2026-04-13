using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MediaHouse.DTOs;
using MediaHouse.Extensions;
using MediaHouse.Interfaces;
using MediaHouse.Data;
using Microsoft.EntityFrameworkCore;
using MediaHouse.Data.Entities;

namespace MediaHouse.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class UserController(
    MediaHouseDbContext dbContext,
    IAuthService authService,
    ILogger<UserController> logger) : ControllerBase
{
    private readonly MediaHouseDbContext _context = dbContext;
    private readonly IAuthService _authService = authService;
    private readonly ILogger<UserController> _logger = logger;

    [HttpGet("me")]
    public async Task<ActionResult<UserProfileDto>> GetCurrentUserProfile()
    {
        try
        {
            var userId = HttpContext.GetUserId();
            if (userId == null)
            {
                return Unauthorized(new { error = "User not authenticated" });
            }

            var user = await _context.AppUsers.FindAsync(userId.Value);
            if (user == null)
            {
                return NotFound(new { error = "User not found" });
            }

            var profile = new UserProfileDto
            {
                Id = user.Id,
                Username = user.Username,
                Email = user.Email,
                IsActive = user.IsActive,
                CreateTime = user.CreateTime,
                UpdateTime = user.UpdateTime
            };

            return Ok(profile);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching current user profile");
            return StatusCode(500, new { error = "Failed to fetch user profile" });
        }
    }

    [HttpPut("me")]
    public async Task<ActionResult<UserProfileDto>> UpdateCurrentUserProfile([FromBody] UpdateUserProfileDto dto)
    {
        try
        {
            var userId = HttpContext.GetUserId();
            if (userId == null)
            {
                return Unauthorized(new { error = "User not authenticated" });
            }

            var user = await _context.AppUsers.FindAsync(userId.Value);
            if (user == null)
            {
                return NotFound(new { error = "User not found" });
            }

            // Update email if provided
            if (dto.Email != null)
            {
                user.Email = dto.Email;
            }

            // Update password if both current and new password are provided
            if (!string.IsNullOrEmpty(dto.CurrentPassword) && !string.IsNullOrEmpty(dto.NewPassword))
            {
                // Verify current password
                if (!_authService.VerifyPassword(dto.CurrentPassword, user.PasswordHash))
                {
                    return BadRequest(new { error = "Current password is incorrect" });
                }

                // Validate new password
                if (dto.NewPassword.Length < 6)
                {
                    return BadRequest(new { error = "New password must be at least 6 characters long" });
                }

                // Hash and update new password
                user.PasswordHash = _authService.HashPassword(dto.NewPassword);
            }

            user.UpdateTime = DateTime.UtcNow;
            await _context.SaveChangesAsync();

            var profile = new UserProfileDto
            {
                Id = user.Id,
                Username = user.Username,
                Email = user.Email,
                IsActive = user.IsActive,
                CreateTime = user.CreateTime,
                UpdateTime = user.UpdateTime
            };

            return Ok(profile);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating current user profile");
            return StatusCode(500, new { error = "Failed to update user profile" });
        }
    }

    [HttpGet]
    public async Task<ActionResult<PagedResponseDto<UserProfileDto>>> GetUsers([FromQuery] UserListQueryDto query)
    {
        try
        {
            var userId = HttpContext.GetUserId();
            if (userId == null)
            {
                return Unauthorized(new { error = "User not authenticated" });
            }

            var queryable = _context.AppUsers.AsQueryable();

            // 应用过滤条件
            if (!string.IsNullOrEmpty(query.Username))
            {
                queryable = queryable.Where(u => u.Username.Contains(query.Username));
            }

            if (!string.IsNullOrEmpty(query.Email))
            {
                queryable = queryable.Where(u => u.Email != null && u.Email.Contains(query.Email));
            }

            if (query.IsActive.HasValue)
            {
                queryable = queryable.Where(u => u.IsActive == query.IsActive.Value);
            }

            // 获取总数
            var totalCount = await queryable.CountAsync();

            // 分页
            var users = await queryable
                .OrderBy(u => u.Id)
                .Skip((query.Page - 1) * query.PageSize)
                .Take(query.PageSize)
                .Select(u => new UserProfileDto
                {
                    Id = u.Id,
                    Username = u.Username,
                    Email = u.Email,
                    IsActive = u.IsActive,
                    CreateTime = u.CreateTime,
                    UpdateTime = u.UpdateTime
                })
                .ToListAsync();

            return Ok(new PagedResponseDto<UserProfileDto>
            {
                Items = users,
                TotalCount = totalCount,
                Page = query.Page,
                PageSize = query.PageSize
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching user list");
            return StatusCode(500, new { error = "Failed to fetch user list" });
        }
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<UserProfileDto>> GetUserById(int id)
    {
        try
        {
            var userId = HttpContext.GetUserId();
            if (userId == null)
            {
                return Unauthorized(new { error = "User not authenticated" });
            }

            var user = await _context.AppUsers.FindAsync(id);
            if (user == null)
            {
                return NotFound(new { error = "User not found" });
            }

            var profile = new UserProfileDto
            {
                Id = user.Id,
                Username = user.Username,
                Email = user.Email,
                IsActive = user.IsActive,
                CreateTime = user.CreateTime,
                UpdateTime = user.UpdateTime
            };

            return Ok(profile);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching user by ID");
            return StatusCode(500, new { error = "Failed to fetch user" });
        }
    }

    [HttpPost]
    public async Task<ActionResult<UserProfileDto>> CreateUser([FromBody] CreateUserDto dto)
    {
        try
        {
            var userId = HttpContext.GetUserId();
            if (userId == null)
            {
                return Unauthorized(new { error = "User not authenticated" });
            }

            // 验证用户名
            if (string.IsNullOrWhiteSpace(dto.Username) || dto.Username.Length < 3)
            {
                return BadRequest(new { error = "Username must be at least 3 characters long" });
            }

            // 验证密码
            if (string.IsNullOrWhiteSpace(dto.Password) || dto.Password.Length < 6)
            {
                return BadRequest(new { error = "Password must be at least 6 characters long" });
            }

            // 检查用户名是否已存在
            var existingUser = await _context.AppUsers
                .FirstOrDefaultAsync(u => u.Username == dto.Username);
            if (existingUser != null)
            {
                return BadRequest(new { error = "Username already exists" });
            }

            // 创建用户
            var user = new AppUser
            {
                Username = dto.Username,
                PasswordHash = _authService.HashPassword(dto.Password),
                Email = dto.Email,
                IsActive = true,
                CreateTime = DateTime.UtcNow,
                UpdateTime = DateTime.UtcNow
            };

            _context.AppUsers.Add(user);
            await _context.SaveChangesAsync();

            var profile = new UserProfileDto
            {
                Id = user.Id,
                Username = user.Username,
                Email = user.Email,
                IsActive = user.IsActive,
                CreateTime = user.CreateTime,
                UpdateTime = user.UpdateTime
            };

            return CreatedAtAction(nameof(GetUserById), new { id = user.Id }, profile);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating user");
            return StatusCode(500, new { error = "Failed to create user" });
        }
    }

    [HttpPut("{id}")]
    public async Task<ActionResult<UserProfileDto>> UpdateUser(int id, [FromBody] UpdateUserDto dto)
    {
        try
        {
            var userId = HttpContext.GetUserId();
            if (userId == null)
            {
                return Unauthorized(new { error = "User not authenticated" });
            }

            var user = await _context.AppUsers.FindAsync(id);
            if (user == null)
            {
                return NotFound(new { error = "User not found" });
            }

            // 更新邮箱
            if (dto.Email != null)
            {
                user.Email = dto.Email;
            }

            // 更新激活状态
            if (dto.IsActive.HasValue)
            {
                user.IsActive = dto.IsActive.Value;
            }

            user.UpdateTime = DateTime.UtcNow;
            await _context.SaveChangesAsync();

            var profile = new UserProfileDto
            {
                Id = user.Id,
                Username = user.Username,
                Email = user.Email,
                IsActive = user.IsActive,
                CreateTime = user.CreateTime,
                UpdateTime = user.UpdateTime
            };

            return Ok(profile);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating user");
            return StatusCode(500, new { error = "Failed to update user" });
        }
    }

    [HttpDelete("{id}")]
    public async Task<ActionResult> DeleteUser(int id)
    {
        try
        {
            var userId = HttpContext.GetUserId();
            if (userId == null)
            {
                return Unauthorized(new { error = "User not authenticated" });
            }

            // 不允许删除自己
            if (id == userId.Value)
            {
                return BadRequest(new { error = "Cannot delete your own account. Use DELETE /api/user/me instead." });
            }

            var user = await _context.AppUsers.FindAsync(id);
            if (user == null)
            {
                return NotFound(new { error = "User not found" });
            }

            _context.AppUsers.Remove(user);
            await _context.SaveChangesAsync();

            return Ok(new { message = "User deleted successfully" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting user");
            return StatusCode(500, new { error = "Failed to delete user" });
        }
    }

    [HttpPut("{id}/password")]
    public async Task<ActionResult> ChangePassword(int id, [FromBody] ChangePasswordDto dto)
    {
        try
        {
            var currentUserId = HttpContext.GetUserId();
            if (currentUserId == null)
            {
                return Unauthorized(new { error = "User not authenticated" });
            }

            var user = await _context.AppUsers.FindAsync(id);
            if (user == null)
            {
                return NotFound(new { error = "User not found" });
            }

            // 修改自己的密码，需要验证当前密码
            if (id == currentUserId.Value)
            {
                if (string.IsNullOrEmpty(dto.CurrentPassword))
                {
                    return BadRequest(new { error = "Current password is required" });
                }

                if (!_authService.VerifyPassword(dto.CurrentPassword, user.PasswordHash))
                {
                    return BadRequest(new { error = "Current password is incorrect" });
                }
            }

            // 验证新密码
            if (string.IsNullOrWhiteSpace(dto.NewPassword) || dto.NewPassword.Length < 6)
            {
                return BadRequest(new { error = "New password must be at least 6 characters long" });
            }

            // 更新密码
            user.PasswordHash = _authService.HashPassword(dto.NewPassword);
            user.UpdateTime = DateTime.UtcNow;
            await _context.SaveChangesAsync();

            return Ok(new { message = "Password changed successfully" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error changing password");
            return StatusCode(500, new { error = "Failed to change password" });
        }
    }

    [HttpDelete("me")]
    public async Task<ActionResult> DeleteMyAccount([FromBody] DeleteAccountDto dto)
    {
        try
        {
            var userId = HttpContext.GetUserId();
            if (userId == null)
            {
                return Unauthorized(new { error = "User not authenticated" });
            }

            var user = await _context.AppUsers.FindAsync(userId.Value);
            if (user == null)
            {
                return NotFound(new { error = "User not found" });
            }

            // 验证密码
            if (string.IsNullOrEmpty(dto.Password))
            {
                return BadRequest(new { error = "Password is required to delete account" });
            }

            if (!_authService.VerifyPassword(dto.Password, user.PasswordHash))
            {
                return BadRequest(new { error = "Incorrect password" });
            }

            _context.AppUsers.Remove(user);
            await _context.SaveChangesAsync();

            return Ok(new { message = "Account deleted successfully" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting account");
            return StatusCode(500, new { error = "Failed to delete account" });
        }
    }
}
