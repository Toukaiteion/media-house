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

### Local Development

#### Prerequisites

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

## Docker Deployment

MediaHouse can be deployed using Docker, which packages both frontend and backend into a single container with all necessary dependencies including Chrome and FFmpeg.

### Quick Start

```bash
# Build the Docker image
docker build -t mediahouse:latest .

# Run the container
docker run -d -p 8080:80 \
  -v /host/path/to/media:/app/media \
  -v mediahouse-data:/app/data \
  --name mediahouse \
  mediahouse:latest
```

The application will be available at `http://localhost:8080`

### Build Options

```bash
# Build with specific tag
docker build -t mediahouse:v1.0.0 .

# Build without cache (faster for small changes)
docker build --no-cache -t mediahouse:latest .

# Build for specific platform
docker build --platform linux/amd64 -t mediahouse:latest .
```

### Running with Docker

#### Basic Run

```bash
docker run -d -p 8080:80 --name mediahouse mediahouse:latest
```

#### With Volume Mounts (Recommended)

```bash
docker run -d -p 8080:80 \
  -v /path/to/your/media:/app/media \
  -v mediahouse-data:/app/data \
  -v mediahouse-logs:/app/logs \
  -v mediahouse-plugins:/app/plugins \
  --name mediahouse \
  --restart unless-stopped \
  mediahouse:latest
```

**Volume explanations:**
- `/app/media` - Mount your media files here (movies, TV shows)
- `/app/data` - Database and persistent data (named volume recommended)
- `/app/logs` - Application logs
- `/app/plugins` - Plugin directory

#### With Environment Variables

```bash
docker run -d -p 8080:80 \
  -e ASPNETCORE_ENVIRONMENT=Production \
  -e ASPNETCORE_URLS=http://+:80 \
  -v /path/to/media:/app/media \
  --name mediahouse \
  mediahouse:latest
```

#### With Host Port Mapping

```bash
# Map container port 80 to host port 80
docker run -d -p 80:80 \
  -v /path/to/media:/app/media \
  --name mediahouse \
  mediahouse:latest

# Or use a different host port
docker run -d -p 3000:80 \
  -v /path/to/media:/app/media \
  --name mediahouse \
  mediahouse:latest
```

### Docker Compose (Recommended)

Create a `docker-compose.yml` file:

```yaml
version: '3.8'

services:
  mediahouse:
    build: .
    container_name: mediahouse
    ports:
      - "8080:80"
    volumes:
      - ./media:/app/media
      - mediahouse-data:/app/data
      - mediahouse-logs:/app/logs
      - mediahouse-plugins:/app/plugins
    environment:
      - ASPNETCORE_ENVIRONMENT=Production
      - ASPNETCORE_URLS=http://+:80
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 5s

volumes:
  mediahouse-data:
  mediahouse-logs:
  mediahouse-plugins:
```

Run with Docker Compose:

```bash
# Start services
docker-compose up -d

# Stop services
docker-compose down

# View logs
docker-compose logs -f

# Rebuild and restart
docker-compose up -d --build
```

### Container Management

```bash
# View logs
docker logs -f mediahouse

# Stop container
docker stop mediahouse

# Start container
docker start mediahouse

# Remove container
docker rm mediahouse

# Execute commands inside container
docker exec -it mediahouse bash

# Check container health
docker inspect mediahouse --format='{{.State.Health.Status}}'

# View resource usage
docker stats mediahouse
```

### Troubleshooting

#### Container fails to start
- Check logs: `docker logs mediahouse`
- Ensure ports are not already in use: `netstat -tlnp | grep 8080`
- Verify volume mounts exist on host

#### Cannot access application
- Verify container is running: `docker ps`
- Check port mapping: `docker port mediahouse`
- Ensure firewall allows traffic on the mapped port

#### Health check failing
- Wait a few minutes for application to start
- Check application logs for errors
- Verify health endpoint: `curl http://localhost:8080/health`

#### Media files not accessible
- Verify volume mount points are correct
- Check file permissions on host system
- Ensure media directory is mounted to `/app/media`

#### Chrome headless mode issues
- Chrome is pre-installed in the container
- Ensure no display is required (headless mode)
- Check for sufficient container resources (memory/CPU)

### Important Notes

1. **First Run**: The database will be automatically created on first run
2. **Data Persistence**: Use named volumes for `/app/data` to persist database between container restarts
3. **Media Files**: Mount your media library to `/app/media` inside the container
4. **Chrome**: Pre-installed for headless crawling/scraping
5. **FFmpeg**: Pre-installed for media processing and transcoding
6. **Health Check**: Container includes built-in health check at `/health` endpoint
7. **Production**: Set `ASPNETCORE_ENVIRONMENT=Production` for production deployment

### Performance Tips

- Use named volumes for better I/O performance
- Allocate sufficient memory (at least 2GB recommended)
- Consider using Docker's resource limits for production
- Use `--restart=unless-stopped` for automatic recovery

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
