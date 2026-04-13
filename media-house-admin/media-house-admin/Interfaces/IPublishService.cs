using MediaHouse.DTOs;

namespace MediaHouse.Interfaces;

public interface IPublishService
{
    Task<PublishResponseDto> PublishAsync(string stagingMediaId, PublishRequest request);
}
