# API Service

Main backend API for users, sessions, invites, attendance, and recording metadata.

## Responsibilities

- Auth
- Class/session creation
- Invite link generation
- LiveKit token issuance
- Attendance tracking
- Recording lifecycle metadata
- Admin APIs

## Domain model

Core entities:

- User
- Organization
- ClassSession
- Invite
- AttendanceEvent
- Recording
- DownloadArtifact
- AuditLog

## API design

Use REST for MVP.

Important endpoints:

- POST /auth/magic-link
- POST /auth/verify
- POST /classes
- GET /classes/:id
- POST /classes/:id/invites
- POST /join/resolve
- POST /join/token
- POST /recordings/start
- POST /recordings/stop
- GET /recordings/:id
- GET /admin/classes
- GET /admin/attendance

## Rules

- Controllers should be thin.
- Business logic belongs in services.
- Database access belongs in repositories.
- All external inputs must use DTO validation.
- Use transactions for multi-write workflows.
- Generate audit logs for sensitive actions.
- Never expose internal LiveKit credentials to clients.