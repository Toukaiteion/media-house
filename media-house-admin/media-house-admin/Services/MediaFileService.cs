using MediaHouse.Data.Entities;
using MediaHouse.Interfaces;
using MediaHouse.Data;
using Microsoft.EntityFrameworkCore;

namespace MediaHouse.Services;

public class MediaFileService(MediaHouseDbContext context, ILogger<MediaFileService> logger) : IMediaFileService
{
    private readonly MediaHouseDbContext _context = context;
    private readonly ILogger<MediaFileService> _logger = logger;

    public async Task<MediaFile?> GetMediaFileByPathAsync(string path)
    {
        return await _context.MediaFiles
            .FirstOrDefaultAsync(mf => mf.Path == path);
    }

    public async Task<MediaFile?> GetMediaFileByIdAsync(int id)
    {
        return await _context.MediaFiles.FindAsync(id);
    }

    public async Task<MediaFile> CreateMediaFileAsync(string filePath, int? movieId = null, int? episodeId = null)
    {
        if (!File.Exists(filePath))
            throw new FileNotFoundException($"File not found: {filePath}");

        var fileInfo = new FileInfo(filePath);

        var mediaFile = new MediaFile
        {
            FileName = fileInfo.Name,
            Path = filePath,
            Extension = fileInfo.Extension,
            SizeBytes = fileInfo.Length,
        };

        // TODO: Extract media info using MediaInfo or FFmpeg
        // TODO: Set MediaType based on movieId vs episodeId

        _context.MediaFiles.Add(mediaFile);
        await _context.SaveChangesAsync();

        return mediaFile;
    }

    public async Task<MediaFile?> UpdateMediaFileAsync(int id, MediaFile updatedFile)
    {
        var mediaFile = await _context.MediaFiles.FindAsync(id);
        if (mediaFile == null) return null;

        mediaFile.FileName = updatedFile.FileName;
        mediaFile.Path = updatedFile.Path;
        mediaFile.Extension = updatedFile.Extension;
        mediaFile.Container = updatedFile.Container;
        mediaFile.VideoCodec = updatedFile.VideoCodec;
        mediaFile.AudioCodec = updatedFile.AudioCodec;
        mediaFile.Width = updatedFile.Width;
        mediaFile.Height = updatedFile.Height;
        mediaFile.SizeBytes = updatedFile.SizeBytes;
        mediaFile.UpdateTime = DateTime.UtcNow;

        await _context.SaveChangesAsync();

        return mediaFile;
    }

    public async Task<bool> DeleteMediaFileAsync(int id)
    {
        var mediaFile = await _context.MediaFiles.FindAsync(id);
        if (mediaFile == null) return false;

        _context.MediaFiles.Remove(mediaFile);
        await _context.SaveChangesAsync();

        return true;
    }

    public async Task<List<MediaFile>> GetMediaFilesForLibraryAsync(int libraryId)
    {
        // TODO: Implement proper query to get media files by library
        return await _context.MediaFiles.ToListAsync();
    }
}
