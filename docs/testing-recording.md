# Testing Recording Lifecycle

End-to-end testing guide for the recording implementation.

## Prerequisites

```bash
# 1. Install FFmpeg
brew install ffmpeg  # macOS
# or
sudo apt-get install ffmpeg  # Ubuntu

# 2. Start infrastructure
pnpm docker:up

# 3. Run migrations
cd services/api
pnpm migrate

# 4. Create recordings directory
mkdir -p ~/webinar-recordings
```

## Setup Test Environment

```bash
# Update .env files to use local recordings directory
echo "RECORDINGS_ROOT=$HOME/webinar-recordings" >> services/api/.env
echo "RECORDINGS_ROOT=$HOME/webinar-recordings" >> services/worker/.env

# Build shared package
cd packages/shared
pnpm build
cd ../..

# Start services in separate terminals
cd services/api && pnpm dev        # Terminal 1
cd services/worker && pnpm dev     # Terminal 2
```

## Test 1: Basic Recording Lifecycle

### Start Recording

```bash
curl -X POST http://localhost:3000/classes/test-session-1/recording/start \
  -H "Content-Type: application/json" | jq
```

Expected response:
```json
{
  "success": true,
  "data": {
    "id": "uuid-here",
    "status": "recording_active"
  }
}
```

### Verify Database

```bash
docker exec -it webinar-postgres psql -U webinar -d webinar_db -c \
  "SELECT id, session_id, status, egress_id, started_at FROM recordings ORDER BY created_at DESC LIMIT 1;"
```

Expected: One row with status `recording_active`

### Verify Audit Log

```bash
docker exec -it webinar-postgres psql -U webinar -d webinar_db -c \
  "SELECT action, session_id, recording_id, timestamp FROM audit_logs ORDER BY timestamp DESC LIMIT 1;"
```

Expected: One row with action `recording_start`

### Verify Directory Structure

```bash
ls -la ~/webinar-recordings/test-session-1/raw/
```

Expected: Raw directory created (may be empty until Egress writes)

### Create Test Raw File

Since LiveKit Egress isn't running in dev, create a test file:

```bash
# Get the egress ID from the database
EGRESS_ID=$(docker exec -it webinar-postgres psql -U webinar -d webinar_db -t -c \
  "SELECT egress_id FROM recordings WHERE session_id = 'test-session-1' ORDER BY created_at DESC LIMIT 1;" | tr -d ' \n')

# Create a test video file (or use a real mp4)
ffmpeg -f lavfi -i testsrc=duration=10:size=1920x1080:rate=30 \
  -f lavfi -i sine=frequency=1000:duration=10 \
  -pix_fmt yuv420p \
  ~/webinar-recordings/test-session-1/raw/${EGRESS_ID}.mp4
```

### Stop Recording

```bash
curl -X POST http://localhost:3000/classes/test-session-1/recording/stop \
  -H "Content-Type: application/json" | jq
```

Expected response:
```json
{
  "success": true,
  "data": {
    "id": "uuid-here",
    "status": "processing_queued"
  }
}
```

### Monitor Worker Processing

Watch the worker terminal for logs:

```
[RecordingProcessor] Processing recording <id> for session test-session-1
[RecordingProcessor] Recording <id> status updated to PROCESSING
[RecordingProcessor] Starting FFmpeg conversion: ...
[RecordingProcessor] FFmpeg completed in Xs
[RecordingProcessor] Final recording: .../final/youtube-ready.mp4 (X bytes)
[RecordingProcessor] Recording <id> status updated to READY
```

### Verify Final Status

```bash
curl http://localhost:3000/classes/test-session-1/recording | jq
```

Expected response:
```json
{
  "success": true,
  "data": {
    "id": "uuid-here",
    "status": "ready",
    "duration": 10,
    "fileSize": 123456,
    "resolution": "1080p",
    "downloadUrl": "/recordings/uuid-here/download"
  }
}
```

### Verify Final File

```bash
ls -lh ~/webinar-recordings/test-session-1/final/youtube-ready.mp4

# Check video properties
ffprobe -v error -show_entries stream=codec_name,width,height,r_frame_rate \
  ~/webinar-recordings/test-session-1/final/youtube-ready.mp4
```

Expected:
- File exists
- Codec: h264, aac
- Resolution: 1920x1080
- Frame rate: 30/1

### Verify Audit Logs

```bash
docker exec -it webinar-postgres psql -U webinar -d webinar_db -c \
  "SELECT action, timestamp FROM audit_logs WHERE session_id = 'test-session-1' ORDER BY timestamp;"
```

Expected: Four audit logs in order:
1. `recording_start`
2. `recording_stop`
3. `recording_processing_success`

## Test 2: Concurrent Recordings

```bash
# Try to start another recording for same session
curl -X POST http://localhost:3000/classes/test-session-1/recording/start \
  -H "Content-Type: application/json" | jq
```

Expected: Error response (400 Bad Request)

```json
{
  "success": false,
  "error": "Recording already in progress for this session"
}
```

## Test 3: Stop Non-Existent Recording

```bash
curl -X POST http://localhost:3000/classes/nonexistent-session/recording/stop \
  -H "Content-Type: application/json" | jq
```

Expected: Error response (404 Not Found)

```json
{
  "success": false,
  "error": "No active recording found for this session"
}
```

## Test 4: Processing Failure

### Create Invalid Raw File

```bash
# Start a new recording
curl -X POST http://localhost:3000/classes/test-session-2/recording/start \
  -H "Content-Type: application/json"

# Get egress ID
EGRESS_ID=$(docker exec -it webinar-postgres psql -U webinar -d webinar_db -t -c \
  "SELECT egress_id FROM recordings WHERE session_id = 'test-session-2' ORDER BY created_at DESC LIMIT 1;" | tr -d ' \n')

# Create empty file (will cause FFmpeg to fail)
mkdir -p ~/webinar-recordings/test-session-2/raw
touch ~/webinar-recordings/test-session-2/raw/${EGRESS_ID}.mp4

# Stop recording
curl -X POST http://localhost:3000/classes/test-session-2/recording/stop \
  -H "Content-Type: application/json"
```

### Verify Failure

```bash
# Wait a few seconds for worker to process
sleep 5

# Check status
curl http://localhost:3000/classes/test-session-2/recording | jq
```

Expected:
```json
{
  "success": true,
  "data": {
    "id": "uuid-here",
    "status": "failed"
  }
}
```

### Verify Failure Audit Log

```bash
docker exec -it webinar-postgres psql -U webinar -d webinar_db -c \
  "SELECT action, metadata FROM audit_logs WHERE session_id = 'test-session-2' AND action = 'recording_processing_failure';"
```

Expected: One failure audit log with error details

## Test 5: Check FFmpeg Logs

```bash
docker exec -it webinar-postgres psql -U webinar -d webinar_db -c \
  "SELECT id, status, error, ffmpeg_logs FROM recordings WHERE session_id = 'test-session-2';"
```

Expected: Error message and FFmpeg logs stored

## Test 6: Multiple Sessions

```bash
# Start recordings for multiple sessions
for i in {1..3}; do
  curl -X POST http://localhost:3000/classes/test-session-${i}/recording/start \
    -H "Content-Type: application/json"
  
  # Create test files
  sleep 1
done

# Check all active recordings
docker exec -it webinar-postgres psql -U webinar -d webinar_db -c \
  "SELECT session_id, status FROM recordings WHERE status = 'recording_active' ORDER BY session_id;"
```

Expected: Three active recordings

## Test 7: Raw File Cleanup

```bash
# Set cleanup flag
echo "RECORDING_CLEANUP_RAW=true" >> services/worker/.env

# Restart worker
# Terminal 2: Ctrl+C and restart: pnpm dev

# Start and stop a recording
curl -X POST http://localhost:3000/classes/test-session-cleanup/recording/start
# Create raw file, then stop
curl -X POST http://localhost:3000/classes/test-session-cleanup/recording/stop

# Wait for processing
sleep 10

# Verify raw file was deleted
ls ~/webinar-recordings/test-session-cleanup/raw/
```

Expected: Raw directory empty or file removed

## Test 8: Long Recording Simulation

```bash
# Create a longer test video (30 seconds)
curl -X POST http://localhost:3000/classes/test-session-long/recording/start

EGRESS_ID=$(docker exec -it webinar-postgres psql -U webinar -d webinar_db -t -c \
  "SELECT egress_id FROM recordings WHERE session_id = 'test-session-long' ORDER BY created_at DESC LIMIT 1;" | tr -d ' \n')

ffmpeg -f lavfi -i testsrc=duration=30:size=1920x1080:rate=30 \
  -f lavfi -i sine=frequency=1000:duration=30 \
  -pix_fmt yuv420p \
  ~/webinar-recordings/test-session-long/raw/${EGRESS_ID}.mp4

curl -X POST http://localhost:3000/classes/test-session-long/recording/stop

# Monitor processing time
time sleep 60

curl http://localhost:3000/classes/test-session-long/recording | jq
```

Expected: Recording completes with correct duration (~30s)

## Cleanup

```bash
# Stop services (Ctrl+C in both terminals)

# Clean up test recordings
rm -rf ~/webinar-recordings/test-session-*

# Clean up database
docker exec -it webinar-postgres psql -U webinar -d webinar_db -c \
  "DELETE FROM recordings WHERE session_id LIKE 'test-session-%';"

docker exec -it webinar-postgres psql -U webinar -d webinar_db -c \
  "DELETE FROM audit_logs WHERE session_id LIKE 'test-session-%';"
```

## Monitoring Queries

### Active recordings
```sql
SELECT id, session_id, status, started_at, 
       EXTRACT(EPOCH FROM (NOW() - started_at)) as duration_seconds
FROM recordings 
WHERE status IN ('recording_starting', 'recording_active')
ORDER BY started_at DESC;
```

### Processing queue
```sql
SELECT id, session_id, status, stopped_at,
       EXTRACT(EPOCH FROM (NOW() - stopped_at)) as queued_seconds
FROM recordings
WHERE status IN ('processing_queued', 'processing')
ORDER BY stopped_at;
```

### Recent completions
```sql
SELECT id, session_id, status, duration, file_size, resolution, processed_at
FROM recordings
WHERE status IN ('ready', 'failed')
ORDER BY processed_at DESC
LIMIT 10;
```

### Audit trail for session
```sql
SELECT action, timestamp, metadata
FROM audit_logs
WHERE session_id = 'your-session-id'
ORDER BY timestamp;
```

## Troubleshooting

### Worker not processing
- Check Redis connection
- Check database connection
- Verify BullMQ queue exists: `docker exec -it webinar-redis redis-cli KEYS "*"`

### FFmpeg errors
- Check FFmpeg installed: `ffmpeg -version`
- Check FFMPEG_PATH in worker .env
- Check raw file exists and is not empty
- Check FFmpeg logs in database

### Database errors
- Run migrations: `cd services/api && pnpm migrate`
- Check PostgreSQL connection
- Check TypeORM synchronize setting
