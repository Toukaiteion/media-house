using MediaHouse.Data.Entities;
using MediaHouse.Interfaces;
using MediaHouse.Data;
using Microsoft.EntityFrameworkCore;

namespace MediaHouse.Services;

public class PlayRecordService(MediaHouseDbContext context, ILogger<PlayRecordService> logger) : IPlayRecordService
{
    private readonly MediaHouseDbContext _context = context;
    private readonly ILogger<PlayRecordService> _logger = logger;

    public async Task UpdatePlaybackProgressAsync(int userId, int mediaLibraryId, int mediaId, double positionSeconds)
    {
        var progress = await _context.PlayRecords
            .FirstOrDefaultAsync(p =>
                p.UserId == userId &&
                p.LibraryId == mediaLibraryId &&
                p.MediaId == mediaId);

        long positionMs = (long)(positionSeconds * 1000);

        if (progress == null)
        {
            progress = new PlayRecord
            {
                UserId = userId,
                LibraryId = mediaLibraryId,
                MediaId = mediaId,
                PositionMs = positionMs,
                LastPlayTime = DateTime.UtcNow
            };
            _context.PlayRecords.Add(progress);
        }
        else
        {
            progress.PositionMs = positionMs;
            progress.LastPlayTime = DateTime.UtcNow;
            progress.UpdateTime = DateTime.UtcNow;
        }

        await _context.SaveChangesAsync();
    }

    public async Task MarkAsCompletedAsync(int userId, int mediaLibraryId, int mediaId)
    {
        var progress = await _context.PlayRecords
            .FirstOrDefaultAsync(p =>
                p.UserId == userId &&
                p.LibraryId == mediaLibraryId &&
                p.MediaId == mediaId);

        if (progress != null)
        {
            progress.IsFinished = true;
            progress.LastPlayTime = DateTime.UtcNow;
            progress.UpdateTime = DateTime.UtcNow;
            await _context.SaveChangesAsync();
        }
    }

    public async Task<PlayRecord?> GetPlayRecordAsync(int mediaId, int userId)
    {
        _logger.LogInformation("Getting play record for media {MediaId} and user {UserId}", mediaId, userId);
        return await _context.PlayRecords
            .FirstOrDefaultAsync(p => p.MediaId == mediaId && p.UserId == userId);
    }

    public async Task<PlayRecord> CreateOrUpdatePlayRecordAsync(int mediaId, int userId, double positionSeconds)
    {
        var playRecord = await _context.PlayRecords
            .FirstOrDefaultAsync(p => p.MediaId == mediaId && p.UserId == userId);

        long positionMs = (long)(positionSeconds * 1000);
        bool isNewPlay = playRecord == null;

        if (playRecord == null)
        {
            // Get media type and library id
            var media = await _context.Medias
                .FirstOrDefaultAsync(m => m.Id == mediaId) ?? throw new Exception("Media not found");

            playRecord = new PlayRecord
            {
                UserId = userId,
                LibraryId = media.LibraryId,
                MediaType = media.Type,
                MediaId = mediaId,
                PositionMs = positionMs,
                LastPlayTime = DateTime.UtcNow
            };
            _context.PlayRecords.Add(playRecord);
        }
        else
        {
            playRecord.PositionMs = positionMs;
            playRecord.LastPlayTime = DateTime.UtcNow;
            playRecord.UpdateTime = DateTime.UtcNow;
        }

        await _context.SaveChangesAsync();

        // Increment play count (only for new records or when starting from beginning)
        if (isNewPlay || positionSeconds < 5)
        {
            var media = await _context.Medias.FindAsync(mediaId);
            if (media != null)
            {
                media.PlayCount = (media.PlayCount ?? 0) + 1;
                media.UpdateTime = DateTime.UtcNow;
                await _context.SaveChangesAsync();
            }
        }

        return playRecord;
    }
}
