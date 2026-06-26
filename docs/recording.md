# Recording Architecture

## Overview

Recording is server-side only. Attendees and instructors do not record locally.

## Flow

```
1. Instructor starts class
2. API calls LiveKit Egress to start recording
3. LiveKit writes raw recording to local disk under RECORDINGS_ROOT
4. Instructor ends class
5. API calls LiveKit Egress to stop recording
6. API enqueues post-processing job
7. Worker picks up job, runs FFmpeg to create final MP4
8. Worker updates database with final file location
9. Admin can download/serve recording
```

## Components

### LiveKit Egress

- Configured to write raw recordings to local disk
- One recording per class session
- Raw format: whatever LiveKit outputs (likely WebM or raw media)

### Storage Layout

```
RECORDINGS_ROOT/
├── <session-id-1>/
│   ├── raw/
│   │   └── <egress-id>.webm          # LiveKit output
│   ├── processing/
│   │   └── <recording-id>.mp4        # In-progress
│   └── final/
│       └── <recording-id>.mp4        # YouTube-ready
└── <session-id-2>/
    └── ...
```

### Worker Post-Processing

After webinar ends:

1. Verify raw file exists and is readable
2. Create processing directory
3. Run FFmpeg with these settings:
   - Container: MP4
   - Video codec: H.264
   - Audio codec: AAC
   - Pixel format: yuv420p
   - Frame rate: 30 fps
   - Resolution: 1080p (fallback to 720p if source is lower)
   - Streaming: +faststart flag
4. Move processed file to final directory
5. Update database with file size, duration, path
6. Clean up raw file (optional, configurable)

### FFmpeg Command

```bash
ffmpeg -i <raw-file> \
  -c:v libx264 \
  -c:a aac \
  -pix_fmt yuv420p \
  -r 30 \
  -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2" \
  -movflags +faststart \
  -y \
  <output-file>
```

Fallback to 720p if source is smaller:

```bash
-vf "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2"
```

## Security

- Never accept raw file paths from users
- All paths are generated server-side using UUIDs
- Recordings stored under configured RECORDINGS_ROOT only
- File paths stored in database, not served directly
- Download endpoints serve files with signed URLs or access control

## Database Schema (Conceptual)

```typescript
Recording {
  id: uuid
  sessionId: uuid
  status: 'pending' | 'recording' | 'processing' | 'completed' | 'failed'
  egressId: string (LiveKit egress ID)
  rawPath: string (relative to RECORDINGS_ROOT)
  finalPath: string (relative to RECORDINGS_ROOT)
  duration: number (seconds)
  fileSize: number (bytes)
  resolution: string ('1080p' | '720p')
  startedAt: timestamp
  stoppedAt: timestamp
  processedAt: timestamp
  error: string (if failed)
}
```

## API Endpoints

### Start Recording

```
POST /classes/:id/recording/start
Authorization: Bearer <instructor-token>

Response:
{
  "success": true,
  "data": {
    "recordingId": "uuid",
    "status": "recording"
  }
}
```

### Stop Recording

```
POST /classes/:id/recording/stop
Authorization: Bearer <instructor-token>

Response:
{
  "success": true,
  "data": {
    "recordingId": "uuid",
    "status": "processing"
  }
}
```

### Get Recording Status

```
GET /classes/:id/recording
Authorization: Bearer <instructor-token>

Response:
{
  "success": true,
  "data": {
    "id": "uuid",
    "status": "completed",
    "duration": 3600,
    "fileSize": 524288000,
    "resolution": "1080p",
    "downloadUrl": "/recordings/<recording-id>/download"
  }
}
```

## Future: YouTube Upload

The final MP4 is designed for YouTube upload:

- Codec compatibility (H.264 + AAC)
- Fast start enabled (web streaming)
- Standard resolutions (1080p/720p)
- 30 fps

A future worker job can:

1. Read final MP4 path from database
2. Use YouTube Data API to upload
3. Update database with YouTube video ID
4. Optionally delete local copy after successful upload

## Configuration

### API Service

```
LIVEKIT_EGRESS_ENABLED=true
RECORDINGS_ROOT=/var/recordings
```

### Worker Service

```
RECORDINGS_ROOT=/var/recordings
FFMPEG_PATH=/usr/bin/ffmpeg
RECORDING_CLEANUP_RAW=false
RECORDING_DEFAULT_RESOLUTION=1080p
```

## Failure Handling

- If LiveKit Egress fails: status=failed, error logged
- If raw file missing: status=failed, error logged
- If FFmpeg fails: retry up to 3 times with exponential backoff
- If post-processing fails permanently: status=failed, raw file preserved
- Failures send alert to admin dashboard
