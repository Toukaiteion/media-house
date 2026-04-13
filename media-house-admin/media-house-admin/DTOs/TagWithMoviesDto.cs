namespace MediaHouse.DTOs;

public class TagWithMoviesDto
{
    public string Id { get; set; } = string.Empty;
    public string TagName { get; set; } = string.Empty;
    public int MediaCount { get; set; }
    public List<MovieDto> Movies { get; set; } = [];
}
