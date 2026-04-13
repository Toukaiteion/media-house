namespace MediaHouse.DTOs;

public class PublishResponseDto
{
    public int MediaId { get; set; }
    public int MovieId { get; set; }
    public string Status { get; set; } = string.Empty;
}
