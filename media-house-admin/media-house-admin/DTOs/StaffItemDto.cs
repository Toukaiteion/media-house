namespace MediaHouse.DTOs;

public class StaffItemDto
{
    public string Name { get; set; } = string.Empty;
    public string Type { get; set; } = string.Empty; // actor, director, writer
    public string? Role { get; set; }
}
