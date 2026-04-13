using MediaHouse.Services;

namespace MediaHouse.Interfaces;

public interface IMetadataService
{
    Task<string?> ExtractImageAsync(string mediaPath, string imageType); // poster, fanart, thumb

    Task<NfoParseResult?> ParseNfoFileFullAsync(string filePath);

    Task<bool> WriteNfoFileAsync(string filePath, NfoUpdateData data);
}
