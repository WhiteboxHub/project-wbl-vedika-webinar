# Recording Setup Summary

Local server-side recording implementation for the webinar platform.

## What Was Added

### 1. Documentation
- **`docs/recording.md`** - Complete recording architecture (204 lines)
  - Flow diagram
  - Storage layout
  - FFmpeg command details
  - Security rules
  - API endpoints
  - Future YouTube upload design

### 2. Shared Types & Constants

**`packages/shared/src/types.ts`**
- Added `RecordingStatus.RECORDING` state
- Added `RecordingResolution` enum (1080p, 720p)
- Enhanced `Recording` interface with:
  - `egressId` - LiveKit egress ID
  - `rawPath` - Path to raw recording
  - `finalPath` - Path to processed MP4
  - `resolution` - Output resolution
  - `error` - Error message if failed
  - Timestamp fields: `stoppedAt`, `processedAt`
- Added `RecordingStartRequest`, `RecordingStopRequest`, `RecordingResponse`

**`packages/shared/src/constants.ts`**
- Added FFmpeg settings:
  - Video codec: H.264
  - Audio codec: AAC
  - Pixel format: yuv420p
  - Frame rate: 30 fps
  - Resolution configs for 1080p and 720p
  - Retry settings

### 3. API Service (NestJS)

**New Module: `services/api/src/recording/`**
- **`recording.controller.ts`** - REST endpoints:
  - `POST /classes/:id/recording/start`
  - `POST /classes/:id/recording/stop`
  - `GET /classes/:id/recording`
- **`recording.service.ts`** - Business logic:
  - Start recording (creates directory structure)
  - Stop recording (enqueues processing job)
  - Get recording status
  - Path management (ensures no user-controlled paths)
- **`recording.module.ts`** - Module registration with BullMQ

**Updated Files:**
- **`app.module.ts`** - Registered BullModule and RecordingModule
- **`.env.example`** - Added:
  - `LIVEKIT_EGRESS_ENABLED=true`
  - `RECORDINGS_ROOT=/var/recordings`

### 4. Worker Service

**New Files:**
- **`src/utils/ffmpeg.ts`** (65 lines) - FFmpeg command builder
  - `buildFFmpegCommand()` - Constructs safe FFmpeg command
  - `getFullCommand()` - Returns full shell command string
  - Path validation (must be absolute)
  - Resolution-specific scaling filters
  
- **`src/utils/ffmpeg.test.ts`** (146 lines) - Comprehensive tests
  - Tests for 1080p and 720p
  - Custom FFmpeg path support
  - Scale filter validation
  - Error cases (missing paths, relative paths)
  - Full command string generation

**Updated Files:**
- **`src/jobs/recording.processor.ts`** - Full implementation:
  - Verify raw file exists
  - Create processing/final directories
  - Run FFmpeg with retry logic
  - Validate output file
  - Move to final directory
  - Optional cleanup of raw file
  
- **`src/config/config.ts`** - Added settings:
  - `storage.recordingsRoot`
  - `storage.cleanupRaw`
  - `storage.defaultResolution`
  - `ffmpeg.path`

- **`.env.example`** - Added:
  - `RECORDINGS_ROOT=/var/recordings`
  - `FFMPEG_PATH=/usr/bin/ffmpeg`
  - `RECORDING_CLEANUP_RAW=false`
  - `RECORDING_DEFAULT_RESOLUTION=1080p`

- **`package.json`** - Added jest dependencies
- **`jest.config.js`** - Jest configuration for tests

### 5. Root Configuration

**`.env.example`** - Added all recording variables
**`README.md`** - Added Recording Configuration section:
- Environment variables explanation
- Setup instructions for recordings directory
- FFmpeg installation commands

**`QUICK_REFERENCE.md`** - Added:
- Recording troubleshooting
- File locations for recording code

## Directory Structure

```
/var/recordings/                      # RECORDINGS_ROOT
└── <session-id>/
    ├── raw/
    │   └── <egress-id>.webm         # LiveKit output
    ├── processing/
    │   └── <recording-id>.mp4       # In-progress
    └── final/
        └── <recording-id>.mp4       # YouTube-ready
```

## Security Features

✅ No user-controlled file paths
✅ All paths generated server-side with UUIDs
✅ Paths validated as absolute
✅ Recordings scoped under RECORDINGS_ROOT
✅ File paths stored in database, not served directly

## Testing

Run FFmpeg command builder tests:

```bash
cd services/worker
pnpm test src/utils/ffmpeg.test.ts
```

## Setup for Local Development

### 1. Install FFmpeg

```bash
# macOS
brew install ffmpeg

# Ubuntu/Debian
sudo apt-get install ffmpeg

# Verify
ffmpeg -version
```

### 2. Create Recordings Directory

```bash
# Option A: Use default path
sudo mkdir -p /var/recordings
sudo chown $(whoami) /var/recordings

# Option B: Use custom path (recommended for dev)
mkdir -p ~/webinar-recordings
echo "RECORDINGS_ROOT=$HOME/webinar-recordings" >> .env
echo "RECORDINGS_ROOT=$HOME/webinar-recordings" >> services/api/.env
echo "RECORDINGS_ROOT=$HOME/webinar-recordings" >> services/worker/.env
```

### 3. Build Shared Package

```bash
cd packages/shared
pnpm build
```

### 4. Start Services

```bash
# Terminal 1: API
cd services/api
pnpm dev

# Terminal 2: Worker
cd services/worker
pnpm dev
```

## API Usage

### Start Recording

```bash
curl -X POST http://localhost:3000/classes/session-123/recording/start \
  -H "Content-Type: application/json"
```

Response:
```json
{
  "success": true,
  "data": {
    "id": "recording-uuid",
    "status": "recording"
  }
}
```

### Stop Recording

```bash
curl -X POST http://localhost:3000/classes/session-123/recording/stop \
  -H "Content-Type: application/json"
```

Response:
```json
{
  "success": true,
  "data": {
    "id": "recording-uuid",
    "status": "processing"
  }
}
```

### Get Recording Status

```bash
curl http://localhost:3000/classes/session-123/recording
```

Response:
```json
{
  "success": true,
  "data": {
    "id": "recording-uuid",
    "status": "completed",
    "duration": 3600,
    "fileSize": 524288000,
    "resolution": "1080p",
    "downloadUrl": "/recordings/recording-uuid/download"
  }
}
```

## FFmpeg Output Format

Final recordings are YouTube-ready:

- **Container**: MP4
- **Video Codec**: H.264
- **Audio Codec**: AAC
- **Pixel Format**: yuv420p
- **Frame Rate**: 30 fps
- **Resolution**: 1080p (1920x1080) or 720p (1280x720)
- **Streaming**: faststart flag enabled

This format is compatible with:
- YouTube uploads
- Web streaming
- Most video players

## Future: YouTube Upload

The final MP4 is designed for automated YouTube upload:

1. Worker job reads `finalPath` from database
2. Uses YouTube Data API v3 to upload
3. Updates database with YouTube video ID
4. Optionally deletes local copy

See `docs/recording.md` for implementation details.

## Testing the Flow

1. Start a mock recording:
```bash
curl -X POST http://localhost:3000/classes/test-session/recording/start
```

2. Create a test raw file:
```bash
mkdir -p ~/webinar-recordings/test-session/raw
# Copy a test video file or create a dummy file
touch ~/webinar-recordings/test-session/raw/<egress-id>.webm
```

3. Stop recording (triggers processing):
```bash
curl -X POST http://localhost:3000/classes/test-session/recording/stop
```

4. Monitor worker logs:
```bash
cd services/worker
pnpm dev
# Watch for FFmpeg processing logs
```

5. Check final output:
```bash
ls -lh ~/webinar-recordings/test-session/final/
```

## File Summary

**Created:** 9 new files (415 lines of code)
**Modified:** 9 existing files
**Tests:** 146 lines of test coverage for FFmpeg builder

All changes follow the "smallest safe diff" principle with no YouTube upload implementation yet.
