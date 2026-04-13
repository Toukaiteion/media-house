# Media House Admin API

## Base URL
`http://localhost:5000` (or configured port)

---

## Movies API

### Get Movies List
**URL:** `GET /api/movies`

**Query Parameters:**
- `page` (int, default: 1)
- `pageSize` (int, default: 20)
- `libraryId` (int, optional)
- `filter` (string, optional): `tags`, `actor`, `recent`, `mostly_play`, `favor`
- `tags` (string, optional, comma-separated)
- `actorId` (int, optional)
- `userId` (int, optional, for `recent` and `favor` filters)

**Request:**
```bash
curl "http://localhost:5000/api/movies?page=1&pageSize=20"
```

**Response:**
```json
[
  {
    "id": "1",
    "title": "Movie Title",
    "year": 2023,
    "poster_path": "abc123.jpg",
    "thumb_path": "def456.jpg",
    "fanart_path": "ghi789.jpg",
    "overview": "Movie description",
    "created_at": "2024-01-01T00:00:00Z",
    "media_library_id": "1",
    "play_count": 5
  }
]
```

**Filter Examples:**
```bash
# By tags
curl "http://localhost:5000/api/movies?filter=tags&tags=action,drama"

# By actor
curl "http://localhost:5000/api/movies?filter=actor&actorId=1"

# Recent played
curl "http://localhost:5000/api/movies?filter=recent&userId=1"

# Most played
curl "http://localhost:5000/api/movies?filter=mostly_play"

# Favorites
curl "http://localhost:5000/api/movies?filter=favor&userId=1"
```

---

### Get Movie Detail
**URL:** `GET /api/movies/{id}`

**Request:**
```bash
curl "http://localhost:5000/api/movies/1"
```

**Response:**
```json
{
  "id": "1",
  "title": "Movie Title",
  "original_title": "Original Title",
  "year": 2023,
  "release_date": "2024-01-01",
  "poster_path": "abc123.jpg",
  "thumb_path": "def456.jpg",
  "fanart_path": "ghi789.jpg",
  "overview": "Movie description",
  "created_at": "2024-01-01T00:00:00Z",
  "media_library_id": "1",
  "file_path": "/path/to/movie.mp4",
  "container_format": "mp4",
  "duration": 7200,
  "file_size": 1073741824,
  "num": "001",
  "studio": "Studio Name",
  "maker": "Maker Name",
  "screenshots": [
    {
      "url_name": "screenshot1.jpg",
      "name": "screenshot1",
      "path": "/path/to/screenshot1.jpg",
      "width": 1920,
      "height": 1080,
      "size_bytes": 1048576
    }
  ],
  "actors": [
    {
      "id": "1",
      "name": "Actor Name",
      "avatar_path": "avatar.jpg",
      "role_name": "Character Name"
    }
  ],
  "directors": [...],
  "writers": [...],
  "tags": [
    {
      "id": "1",
      "tag_name": "Action"
    }
  ]
}
```

---

### Delete Movie
**URL:** `DELETE /api/movies/{id}`

**Request:**
```bash
curl -X DELETE "http://localhost:5000/api/movies/1"
```

**Response:**
```json
{
  "message": "Movie deleted successfully"
}
```

**Error Response:**
```json
{
  "error": "Movie not found"
}
```

---

## Media API

### Get Media File (Play)
**URL:** `POST /api/media/{media_id}/play`

**Request Body:**
```json
{
  "user_id": 1,
  "position_seconds": 0
}
```

**Request:**
```bash
curl -X POST "http://localhost:5000/api/media/1/play" \
  -H "Content-Type: application/json" \
  -d '{"user_id": 1, "position_seconds": 0}' \
  --output video.mp4
```

**Response:** Video file stream (direct download)

---

### Get Media File (by path)
**URL:** `GET /api/media/file?path={encoded_path}`

**Request:**
```bash
curl "http://localhost:5000/api/media/file?path=%2Fpath%2Fto%2Fvideo.mp4" --output video.mp4
```

**Response:** File stream

---

### Get Image (by url_name)
**URL:** `GET /api/media/image/{url_name}`

**Request:**
```bash
curl "http://localhost:5000/api/media/image/abc123.jpg" --output image.jpg
```

**Response:** Image file stream

---

### Toggle Favorite
**URL:** (Deprecated) `POST /api/media/{media_id}/favor`

**Request Body:**
```json
{
  "user_id": 1
}
```

**Request:**
```bash
curl -X POST "http://localhost:5000/api/media/1/favor" \
  -H "Content-Type: application/json" \
  -d '{"user_id": 1}'
```

**Response:**
```json
{
  "is_favorited": true,
  "message": "Added to favorites"
}
```

---

## Tags API

### Get Tags List
**URL:** `GET /api/tags`

**Query Parameters:**
- `page` (int, default: 1)
- `pageSize` (int, default: 20)

**Request:**
```bash
curl "http://localhost:5000/api/tags?page=1&pageSize=20"
```

**Response:**
```json
[
  {
    "id": "1",
    "tag_name": "Action"
  }
]
```

---

## Actors API

### Get Actors List
**URL:** `GET /api/actors`

**Query Parameters:**
- `page` (int, default: 1)
- `pageSize` (int, default: 20)

**Request:**
```bash
curl "http://localhost:5000/api/actors?page=1&pageSize=20"
```

**Response:**
```json
[
  {
    "id": "1",
    "name": "Actor Name",
    "avatar_path": "avatar.jpg",
    "type": "actor",
    "country": "US"
  }
]
```

---

## Libraries API

### Get Libraries
**URL:** `GET /api/libraries`

**Response:**
```json
[
  {
    "id": 1,
    "name": "My Library",
    "path": "/path/to/library",
    "type": "movie",
    "status": "active"
  }
]
```

---

## Play Record API

### Get Play Record
**URL:** `GET /api/playrecord/{mediaId}?userId={userId}`

**Request:**
```bash
curl "http://localhost:5000/api/playrecord/1?userId=1"
```

**Response:**
```json
{
  "id": 1,
  "user_id": 1,
  "media_library_id": 1,
  "media_id": 1,
  "position_ms": 3600000,
  "is_finished": false,
  "last_play_time": "2024-01-01T12:00:00Z",
  "created_at": "2024-01-01T10:00:00Z",
  "updated_at": "2024-01-01T12:30:00Z"
}
```

### Create/Update Play Record
**URL:** `POST /api/playrecord/{mediaId}`

**Request Body:**
```json
{
  "user_id": 1,
  "position_seconds": 3600.5
}
```

**Request:**
```bash
curl -X POST "http://localhost:5000/api/playrecord/1" \
  -H "Content-Type: application/json" \
  -d '{"user_id": 1, "position_seconds": 3600.5}'
```

**Response:**
```json
{
  "id": 1,
  "user_id": 1,
  "media_library_id": 1,
  "media_id": 1,
  "position_ms": 3600500,
  "is_finished": false,
  "last_play_time": "2024-01-01T12:30:00Z",
  "created_at": "2024-01-01T10:00:00Z",
  "updated_at": "2024-01-01T12:30:00Z"
}
```

---

## Health Check

**URL:** `GET /health`

**Request:**
```bash
curl "http://localhost:5000/health"
```

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T12:00:00Z"
}
```

---

## Common Response Headers

- `X-Total-Count`: Total number of records (for paginated endpoints)

## Error Response Format

```json
{
  "error": "Error message"
}
```
