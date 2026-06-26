# Enterprise Webinar Architecture

## Overview

Production webinar platform with separated **control plane** (NestJS API + Redis + PostgreSQL) and **media plane** (LiveKit SFU).

```
Browser (React/Tauri)
  ├── REST /api          → NestJS (auth, sessions, moderation)
  ├── WS  /signal        → Chat, polls, presence, hands, WebRTC relay
  ├── IO  /qa            → Q&A namespace (Socket.IO)
  └── WS  /livekit       → LiveKit SFU (media)
```

## Session roles

| Role | Permissions |
|------|-------------|
| **organizer** | Full control: end session, mute/unmute, remove, promote, approve audio |
| **co_organizer** | Same as organizer except cannot demote organizer |
| **presenter** | Publish A/V + screen share; answer Q&A |
| **attendee** | Subscribe, chat, raise hand, request audio (approval required) |

Legacy signal roles map automatically: `host` → organizer, `moderator` → co_organizer.

## Data stores

| Store | Purpose |
|-------|---------|
| PostgreSQL | Users, sessions, `session_participants`, questions, recordings |
| Redis | Raised hands, audio approval queue, grace period, BullMQ jobs |
| LiveKit | WebRTC SFU, simulcast, adaptive stream |

## REST APIs (moderation)

```
GET    /classes/:sessionId/participants
PATCH  /classes/:sessionId/participants/:userId/role          { role }
POST   /classes/:sessionId/participants/:identity/mute        { trackSid, muted }
DELETE /classes/:sessionId/participants/:identity
PATCH  /classes/:sessionId/participants/:userId/audio-approval { approved }
GET    /auth/email/verify?token=...
```

## Signal events (`/signal`)

| Event | Direction | Description |
|-------|-----------|-------------|
| `raise-hand` / `lower-hand` | Client → Server | Redis-backed hand queue |
| `hand-raised` | Server → Room | Broadcast hand state |
| `request-audio` | Attendee → Server | Request mic permission |
| `approve-audio` / `deny-audio` | Moderator → Server | Audio approval flow |
| `role-changed` | Server → Room | Role promotion |
| `participant-muted` | Server → Room | Force mute/unmute |
| `participant-removed` | Server → Room | Removed from room |

## Q&A namespace (`/qa` — Socket.IO)

Connect with `auth: { token: signalToken }`.

| Event | Description |
|-------|-------------|
| `submit-question` | Attendee submits question |
| `approve-question` / `reject-question` | Moderator moderation |
| `answer-question` | Presenter/organizer answers |
| `upvote-question` | Audience upvote |

## Migrations

Run: `cd services/api && pnpm migrate`

- `007_enterprise_session_participants.sql` — roles, email verification, Q&A indexes

## Reliability

- **Heartbeat:** 15s ping/pong on `/signal`
- **Grace period:** 60s Redis grace on disconnect
- **ICE restart:** Client PeerManager with glare-safe restart
- **LiveKit:** Simulcast + adaptiveStream enabled in classroom
- **TURN:** Embedded LiveKit TURN; configure via `LIVEKIT_NODE_IP`

## Local development

```bash
pnpm docker:up    # regenerates livekit.yaml with LAN IP
pnpm dev
```

Use the same origin for host and attendees (e.g. `http://192.168.x.x:5173`).

## Future work

- Tailwind + Shadcn UI migration
- OpenTelemetry metrics + Grafana dashboards
- Email worker (SendGrid/SES) for verification + registration
- LiveKit cluster + horizontal API scaling with Socket.IO Redis adapter
- mediasoup worker pool (if deprecating LiveKit)
