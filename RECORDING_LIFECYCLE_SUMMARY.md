# Recording Lifecycle Implementation Summary

Complete implementation of server-side recording with LiveKit Egress and FFmpeg post-processing.

## What Was Implemented

### 1. Updated Status States

**packages/shared/src/types.ts:**
- Changed from simple statuses to lifecycle states:
  - `RECORDING_STARTING` - Initial state when creating recording
  - `RECORDING_ACTIVE` - LiveKit Egress actively recording
  - `PROCESSING_QUEUED` - Stopped, waiting for worker
  - `PROCESSING` - Worker actively processing with FFmpeg
  - `READY` - Final MP4 ready for download
  - `FAILED` - Something went wrong

- Added `AuditAction` enum and `AuditLog` interface

### 2. Database Layer

**services/api/src/database/entities/recording.entity.ts:**
- TypeORM entity with all recording fields
- Includes `ffmpegLogs` field for debugging

**services/api/src/database/entities/audit-log.entity.ts:**
- TypeORM entity for audit trail
- JSONB metadata field for flexible logging

**services/api/src/database/audit.service.ts:**
- Service for creating audit logs
- Used by API and worker

**services/api/src/database/database.module.ts:**
- Configures TypeORM with PostgreSQL
- Auto-synchronize in development
- Exports entities and audit service

**Migrations:**
- `001_create_recordings_table.sql` - Creates recordings table with indexes
- `002_create_audit_logs_table.sql` - Creates audit_logs table with indexes
- `scripts/run-migrations.ts` - Migration runner script

### 3. LiveKit Egress Integration

**services/api/src/livekit/egress.service.ts:**
- Wraps LiveKit Egress SDK
- `startRoomCompositeEgress()` - Starts recording to local file
- `stopEgress()` - Stops recording
- Configurable via `LIVEKIT_EGRESS_ENABLED`

**services/api/src/livekit/livekit.module.ts:**
- Module for LiveKit services

### 4. Recording Service (API)

**services/api/src/recording/recording.service.ts:**
- Complete lifecycle implementation:

**startRecording(sessionId, userId?):**
1. Check for existing active recording
2. Create recording row with `RECORDING_STARTING`
3. Create session directory structure
4. Start LiveKit Egress
5. Update status to `RECORDING_ACTIVE`
6. Create audit log

**stopRecording(sessionId, userId?):**
1. Find active recording
2. Stop LiveKit Egress
3. Update status to `PROCESSING_QUEUED`
4. Enqueue worker job
5. Create audit log

**getRecording(sessionId):**
- Returns recording status and metadata
- Includes download URL if status is `READY`

**updateRecordingStatus(recordingId, status, updates):**
- Used by worker to update status

### 5. Worker Processor

**services/worker/src/jobs/recording.processor.ts:**
- Complete processing implementation:

**processRecording(job):**
1. Load recording from database
2. Update status to `PROCESSING`
3. Verify raw file exists
4. Create processing/final directories
5. Run FFmpeg with proper settings
6. Capture FFmpeg logs
7. Verify output file
8. Move to final directory
9. Update status to `READY` with metadata
10. Create success audit log
11. Optional: Clean up raw file

**On failure:**
- Update status to `FAILED`
- Store error message
- Store FFmpeg logs
- Create failure audit log

### 6. Audit Logging

All lifecycle events are audited:

1. **recording_start** - When instructor starts
   - Metadata: egressId, rawPath

2. **recording_stop** - When instructor stops
   - Metadata: egressId, duration

3. **recording_processing_success** - When worker succeeds
   - Metadata: finalPath, fileSize, resolution, processingDurationSeconds

4. **recording_processing_failure** - When worker fails
   - Metadata: error, ffmpegLogs (truncated)

### 7. Documentation

- **docs/recording-lifecycle.md** - Complete state machine and flows
- **docs/testing-recording.md** - E2E testing guide with 8 test scenarios
- Updated **README.md** with migration instructions
- Updated **docs/recording.md** with lifecycle details

## File Structure

```
services/api/src/
├── database/
│   ├── entities/
│   │   ├── recording.entity.ts        # Recording model
│   │   └── audit-log.entity.ts        # Audit log model
│   ├── migrations/
│   │   ├── 001_create_recordings_table.sql
│   │   └── 002_create_audit_logs_table.sql
│   ├── audit.service.ts               # Audit logging
│   └── database.module.ts             # Database config
├── livekit/
│   ├── egress.service.ts              # LiveKit Egress wrapper
│   └── livekit.module.ts              # Module config
└── recording/
    ├── recording.controller.ts        # REST endpoints
    ├── recording.service.ts           # Lifecycle logic
    └── recording.module.ts            # Module config

services/worker/src/
└── jobs/
    └── recording.processor.ts         # FFmpeg processing + DB updates
```

## Database Schema

### recordings

| Column        | Type      | Description                |
|---------------|-----------|----------------------------|
| id            | UUID      | Primary key                |
| session_id    | VARCHAR   | Session identifier         |
| status        | ENUM      | Lifecycle status           |
| egress_id     | VARCHAR   | LiveKit egress ID          |
| raw_path      | TEXT      | Path to raw file           |
| final_path    | TEXT      | Path to final MP4          |
| duration      | INTEGER   | Duration in seconds        |
| file_size     | BIGINT    | File size in bytes         |
| resolution    | ENUM      | 1080p or 720p              |
| error         | TEXT      | Error if failed            |
| ffmpeg_logs   | TEXT      | FFmpeg output              |
| started_at    | TIMESTAMP | Start time                 |
| stopped_at    | TIMESTAMP | Stop time                  |
| processed_at  | TIMESTAMP | Processing complete time   |
| created_at    | TIMESTAMP | Row creation               |
| updated_at    | TIMESTAMP | Last update                |

**Indexes:**
- session_id
- status
- created_at DESC

### audit_logs

| Column        | Type      | Description                |
|---------------|-----------|----------------------------|
| id            | UUID      | Primary key                |
| action        | ENUM      | Audit action type          |
| user_id       | VARCHAR   | User who acted             |
| session_id    | VARCHAR   | Related session            |
| recording_id  | UUID      | Related recording          |
| metadata      | JSONB     | Additional context         |
| timestamp     | TIMESTAMP | When action occurred       |

**Indexes:**
- action
- recording_id
- session_id
- timestamp DESC

## API Endpoints

### POST /classes/:id/recording/start
- Creates recording with `RECORDING_STARTING`
- Starts LiveKit Egress
- Updates to `RECORDING_ACTIVE`
- Returns recording ID and status

### POST /classes/:id/recording/stop
- Stops LiveKit Egress
- Updates to `PROCESSING_QUEUED`
- Enqueues worker job
- Returns recording ID and status

### GET /classes/:id/recording
- Returns current recording status
- Includes download URL if `READY`

## Setup Instructions

### 1. Install Dependencies

```bash
cd services/api
pnpm install

cd ../worker
pnpm install
```

### 2. Run Migrations

```bash
cd services/api
pnpm migrate
```

### 3. Configure Environment

Ensure these variables are set:

**services/api/.env:**
```
DATABASE_URL=postgresql://webinar:webinar@localhost:5432/webinar_db
REDIS_URL=redis://localhost:6379
LIVEKIT_URL=ws://localhost:7880
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=secret
LIVEKIT_EGRESS_ENABLED=true
RECORDINGS_ROOT=/var/recordings
```

**services/worker/.env:**
```
DATABASE_URL=postgresql://webinar:webinar@localhost:5432/webinar_db
REDIS_URL=redis://localhost:6379
RECORDINGS_ROOT=/var/recordings
FFMPEG_PATH=/usr/bin/ffmpeg
RECORDING_CLEANUP_RAW=false
RECORDING_DEFAULT_RESOLUTION=1080p
```

### 4. Create Recordings Directory

```bash
mkdir -p /var/recordings
# or use custom path
```

### 5. Start Services

```bash
# Terminal 1
cd services/api && pnpm dev

# Terminal 2
cd services/worker && pnpm dev
```

## Testing

See **docs/testing-recording.md** for complete testing guide.

Quick test:

```bash
# Start recording
curl -X POST http://localhost:3000/classes/test/recording/start

# Create test file (since LiveKit Egress isn't actually running)
# Get egress ID from database, create test video

# Stop recording
curl -X POST http://localhost:3000/classes/test/recording/stop

# Wait for processing, then check status
curl http://localhost:3000/classes/test/recording
```

## Monitoring

### Check active recordings

```sql
SELECT id, session_id, status, started_at
FROM recordings
WHERE status IN ('recording_starting', 'recording_active')
ORDER BY started_at DESC;
```

### Check processing queue

```sql
SELECT id, session_id, status, stopped_at
FROM recordings
WHERE status IN ('processing_queued', 'processing')
ORDER BY stopped_at;
```

### Check recent audit logs

```sql
SELECT action, session_id, recording_id, timestamp
FROM audit_logs
ORDER BY timestamp DESC
LIMIT 20;
```

### View FFmpeg logs for failed recording

```sql
SELECT id, error, ffmpeg_logs
FROM recordings
WHERE status = 'failed'
ORDER BY updated_at DESC
LIMIT 1;
```

## Error Handling

- **Start fails** → Recording marked as `FAILED`, audit log created
- **Stop fails** → Recording marked as `FAILED`, audit log created
- **Raw file missing** → Recording marked as `FAILED`, error stored
- **FFmpeg fails** → Retry up to 3 times, then mark as `FAILED`
- **All errors** → Audit log with `recording_processing_failure` created

## Security

✅ No user-controlled file paths
✅ All UUIDs generated server-side
✅ Session IDs sanitized (alphanumeric + `-_` only)
✅ Paths validated as absolute before FFmpeg
✅ Raw files never served directly
✅ Audit logs for all actions

## What's NOT Implemented

❌ Instructor permission validation (placeholder for userId parameter)
❌ Download endpoint implementation
❌ YouTube upload (designed for, not implemented)
❌ Recording playback in desktop client
❌ Auto-cleanup of old recordings
❌ LiveKit Egress webhooks integration

## Next Steps

1. Add instructor authentication/authorization
2. Implement download endpoint with signed URLs
3. Add recording playback UI in desktop client
4. Integrate LiveKit Egress webhooks for better status tracking
5. Add YouTube upload automation
6. Add recording retention policies
7. Add recording analytics

## Dependencies Added

**API package.json:**
- `dotenv` - For migration script

**Worker package.json:**
- Already had all dependencies

## Files Changed

**Created:** 13 new files
**Modified:** 5 existing files

Total new code: ~1,200 lines including tests and documentation.
