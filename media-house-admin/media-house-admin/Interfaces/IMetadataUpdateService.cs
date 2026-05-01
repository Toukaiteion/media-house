using Microsoft.AspNetCore.Http;
using MediaHouse.DTOs;

namespace MediaHouse.Interfaces;

public interface IMetadataUpdateService
{
    Task<MetadataUpdateResult> UpdateMetadataFromArchiveAsync(int mediaId, IFormFile file);
}