# Webinar Platform — Whitebox Learning

A production-grade live webinar and classroom platform built for Whitebox Learning. Supports multi-participant video sessions, real-time Q&A, polls, chat, screen sharing, mic management, attendance tracking, and session recording.

---

## Architecture

This is a **Turborepo monorepo** containing:

| Package | Path | Description |
|---|---|---|
| Desktop Client | `apps/desktop-client` | Vite + React frontend (runs in browser or Tauri wrapper) |
| API | `services/api` | NestJS REST + WebSocket API |
| Worker | `services/worker` | BullMQ background job processor |
| Shared | `packages/shared` | Shared TypeScript types, enums, and constants |

### System Diagram

```
┌─────────────────────────────────────────┐
│           Desktop Client                │
│  React + Vite (browser / Tauri)         │
│                                         │
│  LiveKit SDK  ←→  LiveKit SFU (WebRTC)  │
│  Signal WS    ←→  NestJS Signal Gateway │
└────────────┬────────────────────────────┘
             │ HTTP REST + WebSocket
             ▼
┌─────────────────────────────────────────┐
│              NestJS API                 │
│                                         │
│  auth · sessions · join · invites       │
│  email · participants · recording       │
│  signal (WS gateway) · Q&A · polls      │
│  hands · livekit · health               │
└────┬──────────────┬──────────────┬──────┘
     │              │              │
     ▼              ▼              ▼
PostgreSQL       Redis          LiveKit
(TypeORM)     (BullMQ queue)  (WebRTC SFU)
                                   │
                                   ▼
                             MinIO / S3
                          (recording storage)
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite |
| Desktop wrapper | Tauri (optional — runs in browser without it) |
| Backend | NestJS, TypeScript |
| Database | PostgreSQL (TypeORM) |
| Cache / Queue | Redis + BullMQ |
| Real-time | WebSocket (NestJS Gateway) + LiveKit WebRTC SFU |
| Email | Nodemailer (SMTP / Gmail App Password) |
| Storage | S3-compatible (MinIO for local dev) |
| Monorepo | Turborepo + pnpm workspaces |

---

## Features

### Host / Organizer
- Create and schedule webinar sessions
- Share screen (4K / 1080p simulcast)
- Full microphone with device selection
- Approve or deny attendee mic requests
- Force-mute attendees
- Promote attendees to co-organizer or presenter
- Kick / remove participants
- Create live polls and view results in real time
- Approve, answer, and reject Q&A questions
- Raise / lower hand signals
- Send reactions (emoji)
- Start / stop session recording (downloads as `.webm`)
- End session for all participants

### Attendee
- Register via invite link (email confirmation sent)
- Join via waiting room with invite token
- Request microphone access
- Raise hand
- Submit Q&A questions, upvote others' questions
- Vote in polls
- Real-time chat
- Send reactions

### Platform
- JWT-based authentication for hosts
- Email verification for host accounts
- Signal WebSocket gateway with room state sync
- ICE / STUN / TURN configuration for NAT traversal
- Native WebRTC path (no LiveKit dependency) via `USE_NATIVE_WEBRTC=true`
- Session attendance tracking
- LiveKit Egress recording with FFmpeg post-processing

---

## Prerequisites

| Tool | Version |
|---|---|
| Node.js | ≥ 20.0.0 |
| pnpm | ≥ 9.0.0 |
| Docker + Docker Compose | any recent version |
| Rust | ≥ 1.70 *(only needed for Tauri desktop build)* |
| FFmpeg | any recent *(only needed for recording post-processing)* |

---

## Quick Start

### 1. Clone and install

```bash
git clone <repo-url>
cd project-wbl-vedika-webinar
pnpm install
```

### 2. Start infrastructure

```bash
pnpm docker:up
```

This starts PostgreSQL, Redis, LiveKit, and MinIO. Verify with:

```bash
docker compose ps
```

### 3. Configure environment

```bash
cp .env.example .env
cp services/api/.env.example services/api/.env
```

Edit `services/api/.env` with your values (see [Environment Variables](#environment-variables) below).

### 4. Run database migrations

```bash
cd services/api
pnpm migrate
```

### 5. Start services

**All at once (from repo root):**

```bash
pnpm dev
```

**Or in separate terminals:**

```bash
# Terminal 1 — API server (http://localhost:3000)
cd services/api && pnpm dev

# Terminal 2 — Worker (background jobs)
cd services/worker && pnpm dev

# Terminal 3 — Frontend (http://localhost:5173)
cd apps/desktop-client && pnpm dev
```

### 6. Create your first host account

Open `http://localhost:5173` and register as a host, then verify your email (check the API console log if SMTP is not configured — the verification link is printed there).

---

## Environment Variables

### Root / API (`services/api/.env`)

#### Database & Cache

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `postgresql://webinar:webinar@localhost:5432/webinar_db` | PostgreSQL connection string |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection string |

#### Authentication

| Variable | Default | Description |
|---|---|---|
| `JWT_SECRET` | *(change this!)* | JWT signing secret |

#### LiveKit (WebRTC SFU)

| Variable | Default | Description |
|---|---|---|
| `LIVEKIT_URL` | `ws://localhost:7880` | LiveKit server WebSocket URL |
| `LIVEKIT_API_KEY` | `devkey` | LiveKit API key |
| `LIVEKIT_API_SECRET` | `devkey-local-secret-…` | LiveKit API secret |
| `LIVEKIT_NODE_IP` | *(auto)* | LAN IP for ICE candidates when attendees join from other devices (e.g. `192.168.0.60`) |

#### Native WebRTC (alternative to LiveKit)

| Variable | Default | Description |
|---|---|---|
| `USE_NATIVE_WEBRTC` | `false` | Enable built-in WebRTC signaling instead of LiveKit |
| `STUN_URL` | Google STUN servers | Comma-separated STUN URLs |
| `TURN_URL` | — | TURN relay server URL (required for strict NAT) |
| `TURN_SECRET` | — | TURN shared secret |
| `TURN_TTL_SECONDS` | `3600` | TURN credential TTL |

#### Email (SMTP)

> When `SMTP_HOST` is empty, emails are printed to the console instead of being sent — useful for local dev.

| Variable | Default | Description |
|---|---|---|
| `SMTP_HOST` | *(empty — dev log mode)* | SMTP hostname e.g. `smtp.gmail.com` |
| `SMTP_PORT` | `587` | SMTP port |
| `SMTP_SECURE` | `false` | Use TLS (`true` for port 465) |
| `SMTP_USER` | — | SMTP username / Gmail address |
| `SMTP_PASS` | — | SMTP password or **Gmail App Password** |
| `EMAIL_FROM` | `Whitebox Learning Webinars <webinars@…>` | From address |

> **Gmail users:** You must use a 16-character App Password (not your regular password). Generate one at [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords).

#### Recording

| Variable | Default | Description |
|---|---|---|
| `LIVEKIT_EGRESS_ENABLED` | `true` | Enable LiveKit Egress recording |
| `RECORDINGS_ROOT` | `/var/recordings` | Directory for raw recording files |
| `FFMPEG_PATH` | `/usr/bin/ffmpeg` | Path to FFmpeg binary |
| `RECORDING_CLEANUP_RAW` | `false` | Delete raw files after FFmpeg processing |
| `RECORDING_DEFAULT_RESOLUTION` | `1080p` | Output resolution |

#### Storage (S3 / MinIO)

| Variable | Default | Description |
|---|---|---|
| `S3_ENDPOINT` | `http://localhost:9000` | MinIO / S3 endpoint |
| `S3_BUCKET` | `webinar-recordings` | Bucket name |
| `S3_ACCESS_KEY` | `minioadmin` | Access key |
| `S3_SECRET_KEY` | `minioadmin` | Secret key |
| `S3_REGION` | `us-east-1` | Region |

#### App

| Variable | Default | Description |
|---|---|---|
| `API_PORT` | `3000` | API server port |
| `PUBLIC_APP_URL` | `http://localhost:5173` | Frontend URL (used in invite / email links) |
| `NODE_ENV` | `development` | `development` or `production` |
| `LOG_LEVEL` | `debug` | Logging level |

---

## Project Structure

```
project-wbl-vedika-webinar/
├── apps/
│   └── desktop-client/            # Vite + React frontend
│       └── src/
│           ├── lib/               # API client, WebRTC, signaling, screen-share
│           │   └── webrtc/        # RoomManager, PeerManager, diagnostics
│           └── pages/             # Route pages
│               ├── Classroom.tsx          # LiveKit webinar room
│               ├── NativeClassroomView.tsx # Native WebRTC webinar room
│               ├── WaitingRoom.tsx        # Pre-join waiting screen
│               ├── Register.tsx           # Attendee registration
│               ├── Dashboard.tsx          # Host dashboard
│               ├── SessionDetail.tsx      # Session management
│               └── classroom/             # Sidebar panels (polls, Q&A, reactions)
│
├── services/
│   ├── api/                       # NestJS REST + WebSocket API
│   │   └── src/
│   │       ├── auth/              # JWT auth, login, registration, email verify
│   │       ├── sessions/          # Session CRUD
│   │       ├── join/              # Join tokens, host tokens, attendee registration
│   │       ├── invites/           # Invite token generation and resolution
│   │       ├── email/             # SMTP email delivery (confirmation, verification)
│   │       ├── participants/      # Participant tracking and upsert
│   │       ├── signal/            # WebSocket signaling gateway (chat, hands, Q&A, polls)
│   │       ├── qa/                # Q&A question lifecycle
│   │       ├── hands/             # Raise/lower hand signals
│   │       ├── livekit/           # LiveKit token generation
│   │       ├── recording/         # Recording start/stop and status
│   │       ├── health/            # Health check endpoint
│   │       └── database/          # TypeORM entities and migrations
│   │
│   └── worker/                    # BullMQ job processor
│       └── src/
│           └── jobs/              # Recording post-processing with FFmpeg
│
├── packages/
│   └── shared/                    # @webinar/shared
│       └── src/                   # Types, enums, constants used by all packages
│
├── docker/
│   └── livekit.yaml               # LiveKit server configuration
├── docker-compose.yml             # Local infrastructure
└── .env.example                   # Root environment template
```

---

## Service Ports

| Service | Port | Notes |
|---|---|---|
| Frontend (dev) | 5173 | Vite dev server |
| API | 3000 | NestJS REST + WS |
| PostgreSQL | 5432 | |
| Redis | 6379 | |
| LiveKit HTTP | 7880 | |
| LiveKit RTC | 7881 | TCP fallback |
| LiveKit RTC | 7882 | UDP media |
| MinIO API | 9000 | S3-compatible |
| MinIO Console | 9001 | Web UI |

---

## API Endpoints (Key Routes)

| Method | Path | Description |
|---|---|---|
| `POST` | `/auth/register` | Register a host account |
| `POST` | `/auth/login` | Login, returns JWT |
| `GET` | `/auth/verify-email` | Verify email address |
| `GET` | `/sessions` | List sessions (host) |
| `POST` | `/sessions` | Create a session |
| `GET` | `/sessions/:id` | Get session details |
| `POST` | `/join/register/:sessionId` | Attendee self-registration (sends confirmation email) |
| `POST` | `/join/token` | Exchange invite token for join grant |
| `POST` | `/join/host-token` | Issue host join token |
| `POST` | `/invites/:sessionId` | Create an invite link |
| `GET` | `/health` | Health check (DB + Redis status) |

WebSocket events are handled by the **Signal Gateway** (`/signal` namespace) — see `services/api/src/signal/` for the full event list.

---

## Health Check

```bash
curl http://localhost:3000/health
```

```json
{
  "status": "ok",
  "timestamp": "2026-06-26T…",
  "services": {
    "database": "ok",
    "redis": "ok"
  }
}
```

---

## Development Scripts

Run from the **repo root** with pnpm:

| Script | Description |
|---|---|
| `pnpm dev` | Start all services in watch mode |
| `pnpm build` | Build all packages |
| `pnpm lint` | Lint all packages |
| `pnpm clean` | Remove all build artefacts |
| `pnpm docker:up` | Start infrastructure (Postgres, Redis, LiveKit, MinIO) |
| `pnpm docker:down` | Stop infrastructure |
| `pnpm docker:logs` | Tail infrastructure logs |

Run from `services/api`:

| Script | Description |
|---|---|
| `pnpm migrate` | Run TypeORM database migrations |
| `pnpm dev` | Start API in watch mode |
| `pnpm build` | Compile TypeScript |

---

## Building the Desktop Client

### Development (browser)

```bash
cd apps/desktop-client
pnpm dev
# → http://localhost:5173
```

### Development (Tauri desktop app)

```bash
cd apps/desktop-client
pnpm tauri:dev
```

### Production build (Tauri installer)

```bash
cd apps/desktop-client
pnpm tauri:build
```

Installers are output to `apps/desktop-client/src-tauri/target/release/bundle/`.

---

## Recording Setup

Recording uses **LiveKit Egress** (server-side composite) and the Worker service to post-process with FFmpeg.

```bash
# Create the recordings directory (Linux/macOS)
sudo mkdir -p /var/recordings
sudo chown $(whoami) /var/recordings

# Or use a custom path in your .env files
echo "RECORDINGS_ROOT=$HOME/webinar-recordings" >> services/api/.env
echo "RECORDINGS_ROOT=$HOME/webinar-recordings" >> services/worker/.env
```

**Install FFmpeg:**

```bash
# macOS
brew install ffmpeg

# Ubuntu / Debian
sudo apt-get install ffmpeg

# Windows (via winget)
winget install Gyan.FFmpeg

# Verify
ffmpeg -version
```

---

## Troubleshooting

### Docker services won't start

```bash
pnpm docker:down
pnpm docker:up
```

### Port already in use

```bash
# Windows
netstat -ano | findstr :3000

# macOS / Linux
lsof -i :3000
```

### Email auth error (Gmail)

```
535-5.7.8 Username and Password not accepted
```

Gmail requires an **App Password** — your regular password will not work. Generate one at [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords) and set it as `SMTP_PASS` in `services/api/.env`. If you leave `SMTP_HOST` empty, emails are logged to the console instead.

### Attendee registration returns 500

The registration endpoint always succeeds regardless of email delivery status (email failures are caught and logged as warnings). If you see a 500, check the API logs for the actual error upstream of the email step.

### LiveKit ICE connection fails (attendees on other devices)

Set `LIVEKIT_NODE_IP` in your `.env` to your machine's LAN IP address (e.g. `192.168.1.60`). Run `ipconfig` (Windows) or `ifconfig` (macOS/Linux) to find it.

---

## License

MIT
