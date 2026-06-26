# Worker Service

Background job processor.

## Responsibilities

- Recording post-processing.
- Upload verification.
- Email notifications.
- Attendance aggregation.
- Cleanup expired invites.
- Cleanup failed recording jobs.

## Rules

- Jobs must be idempotent.
- Jobs must be retry-safe.
- Use explicit job names and payload types.
- Log job start, success, failure, and retry count.
- Store external object keys, not raw file URLs.
- Never delete recordings unless retention policy allows it.