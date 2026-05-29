# Recording Lifecycle Implementation

Complete implementation of server-side recording with LiveKit Egress integration.

## State Machine

```
RECORDING_STARTING → RECORDING_ACTIVE → PROCESSING_QUEUED → PROCESSING → READY
                                                                        ↓
                                                                      FAILED
```

## Start Recording Flow

1. **Instructor calls** `POST /classes/:id/recording/start`

2. **API validates**:
   - No existing active recording for session
   - (Future: Instructor permission check)

3. **API creates recording row**:
   ```sql
   INSERT INTO recordings (
     id, session_id, status, started_at
   ) VALUES (
     uuid, session_id, 'recording_starting', NOW()
   )
   ```

4. **API starts LiveKit Egress**:
   - Creates session directory structure
   - Calls LiveKit Egress API to start room composite
   - Egress writes to `RECORDINGS_ROOT/<session-id>/raw/<egress-id>.mp4`

5. **API updates status**:
   ```sql
   UPDATE recordings
   SET status = 'recording_active',
       egress_id = egress_id,
       raw_path = raw_path
   WHERE id = recording_id
   ```

6. **API creates audit log**:
   ```sql
   INSERT INTO audit_logs (
     action, user_id, session_id, recording_id, metadata
   ) VALUES (
     'recording_start', user_id, session_id, recording_id, {egress_id, raw_path}
   )
   ```

## Stop Recording Flow

1. **Instructor calls** `POST /classes/:id/recording/stop`
   OR class ends automatically

2. **API stops LiveKit Egress**:
   - Calls LiveKit Egress API to stop egress
   - Egress finalizes the raw file

3. **API marks recording**:
   ```sql
   UPDATE recordings
   SET status = 'processing_queued',
       stopped_at = NOW()
   WHERE id = recording_id
   ```

4. **API enqueues worker job**:
   ```javascript
   recordingQueue.add('process-recording', {
     recordingId,
     sessionId,
     rawPath
   })
   ```

5. **API creates audit log**:
   ```sql
   INSERT INTO audit_logs (
     action, session_id, recording_id, metadata
   ) VALUES (
     'recording_stop', session_id, recording_id, {egress_id, duration}
   )
   ```

## Worker Processing Flow

1. **Worker picks up job** from BullMQ queue

2. **Worker updates status**:
   ```sql
   UPDATE recordings
   SET status = 'processing'
   WHERE id = recording_id
   ```

3. **Worker finds raw file**:
   - Reads `raw_path` from database
   - Verifies file exists and is not empty

4. **Worker creates processing directories**:
   ```
   <session-dir>/processing/
   <session-dir>/final/
   ```

5. **Worker runs FFmpeg**:
   ```bash
   ffmpeg -i raw.mp4 \
     -c:v libx264 \
     -c:a aac \
     -pix_fmt yuv420p \
     -r 30 \
     -vf "scale=1920:1080:..." \
     -movflags +faststart \
     -y processing.mp4
   ```

6. **Worker moves to final**:
   ```bash
   mv processing/recording.mp4 final/youtube-ready.mp4
   ```

7. **Worker updates status on success**:
   ```sql
   UPDATE recordings
   SET status = 'ready',
       final_path = final_path,
       duration = duration_seconds,
       file_size = bytes,
       resolution = '1080p',
       ffmpeg_logs = logs,
       processed_at = NOW()
   WHERE id = recording_id
   ```

8. **Worker creates success audit log**:
   ```sql
   INSERT INTO audit_logs (
     action, session_id, recording_id, metadata
   ) VALUES (
     'recording_processing_success',
     session_id,
     recording_id,
     {finalPath, fileSize, resolution, processingDurationSeconds}
   )
   ```

9. **Worker updates status on failure**:
   ```sql
   UPDATE recordings
   SET status = 'failed',
       error = error_message,
       ffmpeg_logs = logs
   WHERE id = recording_id
   ```

10. **Worker creates failure audit log**:
    ```sql
    INSERT INTO audit_logs (
      action, session_id, recording_id, metadata
    ) VALUES (
      'recording_processing_failure',
      session_id,
      recording_id,
      {error, ffmpegLogs}
    )
    ```

## Database Schema

### recordings table

| Column        | Type                 | Description                    |
|---------------|----------------------|--------------------------------|
| id            | UUID                 | Primary key                    |
| session_id    | VARCHAR(255)         | Session identifier             |
| status        | ENUM                 | Current status                 |
| egress_id     | VARCHAR(255)         | LiveKit egress ID              |
| raw_path      | TEXT                 | Path to raw recording          |
| final_path    | TEXT                 | Path to final MP4              |
| duration      | INTEGER              | Duration in seconds            |
| file_size     | BIGINT               | File size in bytes             |
| resolution    | ENUM                 | '1080p' or '720p'              |
| error         | TEXT                 | Error message if failed        |
| ffmpeg_logs   | TEXT                 | FFmpeg stdout/stderr           |
| started_at    | TIMESTAMP            | Recording start time           |
| stopped_at    | TIMESTAMP            | Recording stop time            |
| processed_at  | TIMESTAMP            | Processing completion time     |
| created_at    | TIMESTAMP            | Row creation time              |
| updated_at    | TIMESTAMP            | Last update time               |

### audit_logs table

| Column        | Type                 | Description                    |
|---------------|----------------------|--------------------------------|
| id            | UUID                 | Primary key                    |
| action        | ENUM                 | Audit action type              |
| user_id       | VARCHAR(255)         | User who performed action      |
| session_id    | VARCHAR(255)         | Related session                |
| recording_id  | UUID                 | Related recording              |
| metadata      | JSONB                | Additional context             |
| timestamp     | TIMESTAMP            | When action occurred           |

## Audit Actions

- `recording_start` - Instructor starts recording
- `recording_stop` - Instructor stops recording
- `recording_processing_success` - Worker successfully processes recording
- `recording_processing_failure` - Worker fails to process recording

## Error Handling

### API Errors

- LiveKit Egress fails to start → Recording marked as FAILED
- LiveKit Egress fails to stop → Recording marked as FAILED
- Database errors → Return 500 to client

### Worker Errors

- Raw file not found → Recording marked as FAILED
- Raw file empty → Recording marked as FAILED
- FFmpeg fails → Recording marked as FAILED, retry up to 3 times
- Database errors → Job thrown back to queue

## Retry Policy

Worker jobs retry with exponential backoff:

```javascript
{
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 2000
  }
}
```

Failed jobs after 3 attempts remain in FAILED status.

## File Paths

All paths are generated server-side:

```
RECORDINGS_ROOT/
└── <sanitized-session-id>/
    ├── raw/
    │   └── <egress-id>.mp4           # LiveKit output
    ├── processing/
    │   └── <recording-id>.mp4        # Temporary
    └── final/
        └── youtube-ready.mp4         # Final output
```

Path sanitization:
- Session ID: Remove all non-alphanumeric chars except `-` and `_`
- Recording ID: Use UUID directly
- Egress ID: Use UUID directly

## Security

- No user-controlled paths
- All UUIDs generated server-side
- Paths validated as absolute before FFmpeg
- Raw files never served directly
- Final files require authorization (future)

## Monitoring

Check recording status:

```bash
# Active recordings
SELECT id, session_id, status, started_at
FROM recordings
WHERE status IN ('recording_starting', 'recording_active')
ORDER BY started_at DESC;

# Processing recordings
SELECT id, session_id, status, stopped_at
FROM recordings
WHERE status IN ('processing_queued', 'processing')
ORDER BY stopped_at DESC;

# Failed recordings
SELECT id, session_id, error, stopped_at
FROM recordings
WHERE status = 'failed'
ORDER BY stopped_at DESC;

# Recent audit logs
SELECT action, session_id, recording_id, timestamp
FROM audit_logs
ORDER BY timestamp DESC
LIMIT 20;
```

## Running Migrations

```bash
cd services/api
pnpm migrate
```

## Testing the Lifecycle

See `docs/testing-recording.md` for complete test scenarios.
