namespace MediaHouse.DTOs;

public class ActorWithMoviesDto
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? AvatarPath { get; set; }
    public int MediaCount { get; set; }
    public List<MovieDto> Movies { get; set; } = [];
}
