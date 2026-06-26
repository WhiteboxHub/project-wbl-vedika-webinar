# CLAUDE.md

You are helping build a production-grade webinar/classroom platform similar to GoToWebinar.

## Product goal

Build cross-platform desktop client software for macOS and Windows. Candidates receive a link, download the client, authenticate, and join a live class. The platform supports up to 100 attendees per class, instructor screen share, camera/mic, chat, attendee list, recording, and replay access.

## Engineering principles

Follow Andrej Karpathy-style engineering discipline:

- Keep the system simple and legible.
- Build the smallest working vertical slice first.
- Prefer boring, reliable technology.
- Avoid speculative abstractions.
- Make state explicit.
- Make failure modes visible.
- Write code that is easy to delete.
- Add tests around behavior, not implementation details.
- Instrument everything important.
- Optimize only after measurement.
- Prefer one obvious path over many configurable paths.

## MVP scope

Must support:

1. Instructor creates a class session.
2. System generates invite link.
3. Attendee opens link and downloads desktop client.
4. Client launches and joins session.
5. Instructor can share screen/audio/video.
6. Up to 100 attendees can watch.
7. Attendees can chat.
8. Session can be recorded.
9. Recording is stored and available after processing.
10. Admin can view classes, users, recordings, and attendance.

Out of scope for MVP:

- Breakout rooms.
- Polls.
- Whiteboard.
- Complex LMS.
- Payment processing.
- Mobile apps.
- Browser-only attendee client unless explicitly requested.

## Architecture preference

Use LiveKit as the media server/SFU. Do not implement WebRTC signaling, SFU routing, TURN orchestration, or recording pipeline from scratch unless explicitly instructed.

Preferred stack:

- Desktop: Tauri + React + TypeScript + Rust
- Backend API: NestJS + TypeScript
- Database: PostgreSQL
- Cache/queue: Redis + BullMQ
- Media: LiveKit self-hosted
- Recording: LiveKit Egress
- Storage: S3-compatible bucket
- Auth: JWT + magic links
- Packaging: Tauri bundler for macOS and Windows
- Observability: OpenTelemetry, structured logs, Prometheus-compatible metrics

## Security requirements

Always consider:

- Session invite links must be signed and time-limited.
- Attendee tokens must be scoped to one room/session.
- Instructor permissions must be distinct from attendee permissions.
- Recordings must be private by default.
- Downloads must be signed or versioned.
- Never log JWTs, invite tokens, magic links, or PII.
- Validate all API input.
- Use least-privilege service credentials.
- Add audit logs for class creation, joins, recording start/stop, and recording access.

## Code standards

Use TypeScript strict mode.

Every feature should include:

- clear types
- error handling
- logging
- tests
- docs update when behavior changes

Avoid:

- global mutable state
- hidden side effects
- giant service classes
- premature microservices
- untyped JSON blobs
- magic constants
- swallowing errors

## Claude behavior

Before coding:

1. Restate the task briefly.
2. Identify affected files.
3. Point out unknowns or risks.
4. Propose the smallest safe implementation.

When coding:

1. Make minimal coherent changes.
2. Keep diffs small.
3. Prefer readable code over clever code.
4. Add tests or explain why not.
5. Run relevant checks when possible.

After coding:

1. Summarize changed files.
2. Explain how to test.
3. Mention any risks or follow-up work.

## Recording policy

Recordings are server-side only.

Do not record on attendee or instructor machines.

Use LiveKit Egress to write raw/intermediate recording files to local server disk. After the webinar ends, the worker must post-process the file with FFmpeg into a YouTube-ready MP4.

Final recording format:

- container: MP4
- video codec: H.264
- audio codec: AAC
- pixel format: yuv420p
- frame rate: 30 fps
- resolution: 1080p preferred, 720p fallback
- streaming flag: +faststart

Recording path rules:

- All recordings must live under RECORDINGS_ROOT.
- Never accept raw output paths from users.
- Use generated IDs for directory and file names.
- Keep raw, processing, and final files separate.
- Store file paths or object keys in database, not public URLs.

YouTube upload is out of scope for now, but final MP4 output must be compatible with future YouTube upload automation.