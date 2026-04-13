# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MediaHouse Admin is a .NET 10.0 ASP.NET Core Web API for managing media libraries (movies). It provides REST APIs for library management, media scanning, and playback tracking.

## Build and Run

```bash
# Build the project
dotnet build

# Run the application
dotnet run --project media-house-admin

# Run with specific configuration
dotnet run --project media-house-admin --configuration Release
```

The application runs on `http://localhost:5000` or `https://localhost:5001` by default (configurable in `Properties/launchSettings.json`).

## Architecture

### Layered Structure

- **Controllers** (`media-house-admin/Controllers/`): REST API endpoints
  - `MediaController` - Media operations
  - `MoviesController` - Movie operations
  - `PlayRecordController` - Playback tracking
  - `LibrariesController` - Library management

- **Services** (`media-house-admin/Services/`): Business logic implementations
  - `LibraryService` - CRUD operations for media libraries
  - `ScanService` - Full and incremental scanning of library directories
  - `MetadataService` - Parsing NFO metadata files
  - `ConsistencyService` - Checking database consistency
  - `PlaybackService` - Tracking user playback progress
  - `MediaFileService` - Media file operations
  - `MediaUtils` - Utility functions for media processing

- **Interfaces** (`media-house-admin/Interfaces/`): Service contracts
  - `IScanService`, `IMetadataService`, etc.

- **Entities** (`media-house-admin/Data/Entities/`): Domain models
  - `MediaLibrary`, `Media`, `Movie`, `MediaFile`, `MediaImgs`
  - `Tag`, `MediaTag`, `Staff`, `MediaStaff`
  - `MediaStaff`, `AppUser`, `PlayRecord`, `SystemSyncLog`, `MyFavor`

### Database

Uses Entity Framework Core with SQLite. Database file: `media-house-admin/mediahouse.db`

**Table Relationships:**
- MediaLibrary 1:n Media (cascade delete)
- Media 1:1 Movie (cascade delete)
- Media 1:1 MediaFile (via Movie.MediaId, legacy)
- Media 1:n MediaImgs (cascade delete)
- Media n:m Tags (via MediaTag)
- Media n:m Staff (via MediaStaff)

**Foreign Keys:**
- `Media.LibraryId` → `MediaLibrary.Id`
- `Media.ParentId` → `Media.Id` (for hierarchical structure)
- `Movie.MediaId` → `Media.Id`
- `MediaFile.MediaId` → `Media.Id`
- `MediaImgs.MediaId` → `Media.Id`
- `MediaTag.TagId` → `Tag.Id`
- `MediaStaff.StaffId` → `Staff.Id`

## Media Scanning Logic

### Directory Structure Example

```
library_root/
├── Movie A (movie directory)
│   ├── movie.mp4 (main video file)
│   ├── movie.nfo (metadata file)
│   ├── poster.jpg (poster image)
│   ├── fanart.jpg (fanart image)
│   └── extrafanart/ (screenshots directory)
│       ├── screenshot1.jpg
│       ├── screenshot2.jpg
│       └── screenshot3.jpg
├── Movie B (movie directory)
│   ├── movie.mkv
│   ├── movie.nfo
│   └── extrafanart/
│       └── ...
└── ...
```

### Scan Process Flow

1. **Scan Library Root** (`ExecuteFullScanAsync`)
   - Iterate through all subdirectories
   - Identify movie directories (contain video files or NFO files)
   - Call `ProcessMovieDirectoryAsync` for each movie

2. **Process Movie Directory** (`ProcessMovieDirectoryAsync`)
   - Find video file (supported: .mp4, .mkv, .avi, .mov, .wmv, .flv, .webm)
   - Find NFO metadata file
   - Parse NFO to extract metadata (title, year, actors, tags, etc.)
   - Call `ProcessMediaItemAsync`

3. **Process Media Item** (`ProcessMediaItemAsync`)
   - Find extrafanart directory for screenshots
   - Generate URL names for all images (poster, thumb, fanart, screenshots)
   - Use database transaction to ensure atomicity
   - Create/Update Media record
   - Create/Update Movie record with screenshot paths
   - Create/Update MediaFile record
   - Create/Update MediaImgs records (poster, thumb, fanart, screenshots)
   - Create/Update Tags and Staff relationships

4. **Image URL Name Generation** (`MediaUtils.GenerateUrlNameFromPath`)
   - Compute MD5 hash of full file path
   - Take first 10 characters of hash
   - Format: `{hash}.{extension}` (e.g., `a1b2c3d4e5f.jpg`)
   - Ensures same file gets same URL name across scans

### Database Schema

**medias table:**
- `id` (PRIMARY KEY)
- `library_id` (FOREIGN KEY → media_libraries.id)
- `type` (movie, tvshow, season, episode)
- `parent_id` (for hierarchical structure)
- `name` (media name)
- `title` (display title)
- `original_title` (original title)
- `release_date` (release date)
- `summary` (description)
- `poster_path` (URL name of poster image)
- `thumb_path` (URL name of thumbnail)
- `fanart_path` (URL name of fanart)

**movies table:**
- `id` (PRIMARY KEY)
- `library_id` (FOREIGN KEY → media_libraries.id)
- `media_id` (FOREIGN KEY → medias.id, 1:1)
- `num` (movie number/identifier from NFO)
- `studio` (production studio)
- `maker` (production company)
- `runtime` (duration in minutes)
- `description` (detailed description)
- `screenshots_path` (comma-separated URL names of screenshots)

**media_imgs table:**
- `id` (PRIMARY KEY)
- `media_id` (FOREIGN KEY → medias.id)
- `url_name` (URL name format: hash.extension)
- `name` (image name without extension)
- `path` (full file path, UNIQUE)
- `file_name` (file name with extension)
- `extension` (file extension without dot)
- `type` (poster, thumb, fanart, screenshot)
- `size_bytes` (file size)

### Supported File Extensions

**Video files:** .mp4, .mkv, .avi, .mov, .wmv, .flv, .webm
**Image files:** .jpg, .jpeg, .png, .webp
**Screenshot files:** .jpg, .jpeg, .png, .webp (same as images)

## API Endpoints

- `/api/libraries`: Library management (create, update, delete, trigger scans)
- `/api/movies`: Movie operations
- `/api/media`: Media file serving (`GET /api/media/file?path=...`)
- `/api/playback`: Playback progress tracking
- `/health`: Health check endpoint

## Development Notes

- Database schema is defined in `db_init.sql` and configured via `MediaHouseDbContext.OnModelCreating`
- Entity Framework Core automatically creates database on first run
- Background scanning runs in a separate task using `Task.Run()`
- Each media type (movie, tvshow, season, episode) uses same base `Media` entity
