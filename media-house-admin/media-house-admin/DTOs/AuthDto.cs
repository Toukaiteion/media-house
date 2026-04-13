namespace MediaHouse.DTOs;

public class LoginRequestDto
{
    public string Username { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
}

public class LoginResponseDto
{
    public string Token { get; set; } = string.Empty;
    public string TokenType { get; set; } = string.Empty;
}

public class RegisterRequestDto
{
    public string Username { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
    public string? Email { get; set; }
}

public class RegisterResponseDto
{
    public int UserId { get; set; }
    public string Username { get; set; } = string.Empty;
}

public class UserProfileDto
{
    public int Id { get; set; }
    public string Username { get; set; } = string.Empty;
    public string? Email { get; set; }
    public bool IsActive { get; set; }
    public DateTime CreateTime { get; set; }
    public DateTime UpdateTime { get; set; }
}

public class UpdateUserProfileDto
{
    public string? Email { get; set; }
    public string? CurrentPassword { get; set; }
    public string? NewPassword { get; set; }
}

// 用户列表查询参数
public class UserListQueryDto
{
    public int Page { get; set; } = 1;
    public int PageSize { get; set; } = 10;
    public string? Username { get; set; }
    public string? Email { get; set; }
    public bool? IsActive { get; set; }
}

// 创建用户请求
public class CreateUserDto
{
    public string Username { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
    public string? Email { get; set; }
}

// 更新用户请求
public class UpdateUserDto
{
    public string? Email { get; set; }
    public bool? IsActive { get; set; }
}

// 修改密码请求
public class ChangePasswordDto
{
    public string? CurrentPassword { get; set; }
    public string NewPassword { get; set; } = string.Empty;
}

// 删除账号确认请求
public class DeleteAccountDto
{
    public string Password { get; set; } = string.Empty;
}
