namespace MediaHouse.DTOs;

public class TVShowDto
{
    public string Id { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public int? Year { get; set; }
    public string? PosterPath { get; set; }
    public string? Overview { get; set; }
    public DateTime CreatedAt { get; set; }
    public string MediaLibraryId { get; set; } = string.Empty;
}

public class SeasonDto
{
    public string Id { get; set; } = string.Empty;
    public int SeasonNumber { get; set; }
    public string TVShowId { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public int EpisodeCount { get; set; }
}

public class EpisodeDto
{
    public string Id { get; set; } = string.Empty;
    public int EpisodeNumber { get; set; }
    public string FileName { get; set; } = string.Empty;
    public string? Title { get; set; }
    public string? Overview { get; set; }
    public string SeasonId { get; set; } = string.Empty;

    // Media file info
    public string? FilePath { get; set; }
    public string? ContainerFormat { get; set; }
    public double? Duration { get; set; }
    public long? FileSize { get; set; }
}
