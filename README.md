# MediaHouse

A lightweight, high-performance private home media server with 100% Emby file structure compatibility.

## Architecture

- **Frontend**: React + TypeScript + Vite + MUI (Material-UI)
- **Backend**: ASP.NET Core + .NET 10 + C#
- **Database**: SQLite (caching layer)
- **Media Engine**: FFmpeg + MediaInfo

## Project Structure

```
MediaHouse/
├── media-house-admin/    # Backend API (.NET)
│   └── media-house-admin/
│       ├── Controllers/   # REST API controllers
│       ├── Services/      # Business logic
│       ├── Entities/      # Database entities
│       ├── Interfaces/    # Service interfaces
│       ├── Data/          # Database context
│       ├── DTOs/          # Data DataTransfer Objects
│       └── BackgroundJobs/# Scheduled tasks
└── media-house-view/     # Frontend (React)
    ├── src/
    │   ├── components/    # Reusable components
    │   ├── pages/        # Page components
    │   ├── services/     # API client
    │   ├── contexts/     # React contexts
    │   ├── layouts/      # Layout components
    │   └── types/        # TypeScript types
```

## Getting Started

### Prerequisites

- .NET 10 SDK
- Node.js 20+
- FFmpeg (optional, for transcoding)
- MediaInfo (optional, for media info extraction)

### Backend Setup

```bash
cd media-house-admin/media-house-admin
dotnet restore
dotnet build
dotnet run
```

The API will be available at `http://localhost:5000`

### Frontend Setup

```bash
cd media-house-view
npm install
npm run dev
```

The frontend will be available at `http://localhost:5173`

## Features

- 📁 Media library management (Movies & TV Shows)
- 🔍 Automatic file scanning with database caching
- 📝 NFO metadata parsing (Emby compatible)
- 🖼️ Poster and fanart support
- ▶️ Direct playback with progress tracking
- 🔄 File-database consistency checks
- ⚡ High-performance SQLite caching

## API Endpoints

### Libraries
- `GET /api/libraries` - Get all libraries
- `POST /api/libraries` - Create a library
- `PUT /api/libraries/{id}` - Update a library
- `DELETE /api/libraries/{id}` - Delete a library
- `POST /api/libraries/{id}/scan` - Trigger scan

### Movies
- `GET /api/movies` - Get all movies
- `GET /api/movies/{id}` - Get movie details

### TV Shows
- `GET /api/tvshows` - Get all TV shows
- `GET /api/tvshows/{id}` - Get TV show details
- `GET /api/tvshows/{id}/seasons` - Get seasons
- `GET /api/tvshows/{id}/seasons/{seasonId}/episodes` - Get episodes

### Playback
- `GET /api/playback/url` - Get playback URL
- `GET /api/playback/progress` - Get playback progress
- `POST /api/playback/progress` - Update playback progress

### Media Files
- `GET /api/media/file?path=...` - Stream media file

## File Structure Compatibility

MediaHouse is 100% compatible with Emby's file structure:

```
Media/
├── Movies/
│   └── Movie Title (Year)/
│       ├── Movie Title.mkv
│       ├── poster.jpg
│       ├── fanart.jpg
│       └── movie.nfo
└── TV Shows/
    └── TV Show Title (Year)/
        ├── Season 1/
        │   ├── Episode Title.S01E01.mkv
        │   └── Episode Title.S01E02.mkv
        ├── poster.jpg
        ├── fanart.jpg
        └── tvshow.nfo
```

## Contributing

This is a personal project for home media management.

## License

MIT
