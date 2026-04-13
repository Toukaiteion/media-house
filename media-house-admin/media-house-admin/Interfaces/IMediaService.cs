using MediaHouse.DTOs;

namespace MediaHouse.Interfaces;

public interface IMediaService
{
    Task<bool> UpdateMediaMetadataAsync(int mediaId, UpdateMediaMetadataDto dto);
}
