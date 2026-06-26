# Webinar Platform

A production-grade webinar/classroom platform built with Tauri, NestJS, and LiveKit.

## Architecture

This is a monorepo containing:

- **`apps/desktop-client`** - Tauri + React desktop client for macOS and Windows
- **`services/api`** - NestJS REST API server
- **`services/worker`** - Background job processor for recordings and async tasks
- **`packages/shared`** - Shared TypeScript types and constants

## Tech Stack

- **Desktop**: Tauri + React + TypeScript + Rust
- **Backend**: NestJS + TypeScript
- **Database**: PostgreSQL
- **Cache/Queue**: Redis + BullMQ
- **Media**: LiveKit (WebRTC SFU)
- **Storage**: S3-compatible (MinIO for local dev)

## Prerequisites

- Node.js >= 20.0.0
- pnpm >= 9.0.0
- Rust >= 1.70 (for Tauri desktop client)
- Docker and Docker Compose

## Quick Start

### 1. Install dependencies

```bash
pnpm install
```

### 2. Start infrastructure

Start PostgreSQL, Redis, LiveKit, and MinIO:

```bash
pnpm docker:up
```

Verify services are healthy:

```bash
docker compose ps
```

### 3. Configure environment

Copy environment files:

```bash
cp .env.example .env
cp services/api/.env.example services/api/.env
cp services/worker/.env.example services/worker/.env
```

Default values work for local development.

### 4. Run database migrations

```bash
cd services/api
pnpm migrate
```

This creates the `recordings` and `audit_logs` tables.

### 5. Run services

In separate terminals:

```bash
# Terminal 1: API server
cd services/api
pnpm dev

# Terminal 2: Worker
cd services/worker
pnpm dev

# Terminal 3: Desktop client
cd apps/desktop-client
pnpm tauri:dev
```

Or run all in parallel:

```bash
pnpm dev
```

## Health Checks

### API Health

```bash
curl http://localhost:3000/health
```

Expected response:

```json
{
  "status": "ok",
  "timestamp": "2026-05-28T...",
  "services": {
    "database": "ok",
    "redis": "ok"
  }
}
```

### Infrastructure Health

```bash
# PostgreSQL
docker exec -it webinar-postgres pg_isready -U webinar

# Redis
docker exec -it webinar-redis redis-cli ping

# LiveKit
curl http://localhost:7880
```

## Development

### Build all packages

```bash
pnpm build
```

### Run tests

```bash
pnpm test
```

### Lint

```bash
pnpm lint
```

### Clean

```bash
pnpm clean
```

## Project Structure

```
.
├── apps/
│   └── desktop-client/       # Tauri desktop app
│       ├── src/              # React UI
│       └── src-tauri/        # Rust backend
├── services/
│   ├── api/                  # NestJS API
│   │   └── src/
│   │       ├── health/       # Health check endpoints
│   │       ├── config/       # Configuration
│   │       └── common/       # Shared utilities
│   └── worker/               # Background jobs
│       └── src/
│           ├── jobs/         # Job processors
│           └── config/       # Configuration
├── packages/
│   └── shared/               # Shared types
│       └── src/
│           ├── types.ts      # TypeScript types
│           └── constants.ts  # Shared constants
├── docker/                   # Docker configs
│   └── livekit.yaml         # LiveKit configuration
├── docker-compose.yml        # Local infrastructure
└── package.json             # Root package.json
```

## Docker Services

| Service    | Port(s)        | Purpose                    |
|------------|----------------|----------------------------|
| PostgreSQL | 5432          | Database                   |
| Redis      | 6379          | Cache and job queue        |
| LiveKit    | 7880-7882     | WebRTC media server        |
| MinIO      | 9000, 9001    | S3-compatible storage      |

## Ports

| Service        | Port  |
|----------------|-------|
| API            | 3000  |
| Desktop Client | 5173  |
| PostgreSQL     | 5432  |
| Redis          | 6379  |
| LiveKit        | 7880  |
| MinIO API      | 9000  |
| MinIO Console  | 9001  |

## Building Desktop Client

### Development

```bash
cd apps/desktop-client
pnpm tauri:dev
```

### Production Build

```bash
cd apps/desktop-client
pnpm tauri:build
```

Installers will be in `apps/desktop-client/src-tauri/target/release/bundle/`.

## Environment Variables

See `.env.example` for all available configuration options.

Key variables:

- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection string
- `LIVEKIT_URL` - LiveKit server WebSocket URL
- `LIVEKIT_API_KEY` - LiveKit API key
- `LIVEKIT_API_SECRET` - LiveKit API secret
- `JWT_SECRET` - JWT signing secret
- `API_PORT` - API server port

### Recording Configuration

Recording is server-side only using LiveKit Egress and FFmpeg post-processing.

**API Service:**
- `LIVEKIT_EGRESS_ENABLED` - Enable recording (default: true)
- `RECORDINGS_ROOT` - Root directory for recordings (default: /var/recordings)

**Worker Service:**
- `RECORDINGS_ROOT` - Root directory for recordings (default: /var/recordings)
- `FFMPEG_PATH` - Path to FFmpeg binary (default: /usr/bin/ffmpeg)
- `RECORDING_CLEANUP_RAW` - Delete raw files after processing (default: false)
- `RECORDING_DEFAULT_RESOLUTION` - Default resolution (default: 1080p)

**Setup Recording Storage:**

```bash
# Create recordings directory
sudo mkdir -p /var/recordings
sudo chown $(whoami) /var/recordings

# Or use a custom path in your .env files
echo "RECORDINGS_ROOT=$HOME/webinar-recordings" >> .env
echo "RECORDINGS_ROOT=$HOME/webinar-recordings" >> services/api/.env
echo "RECORDINGS_ROOT=$HOME/webinar-recordings" >> services/worker/.env
```

**Install FFmpeg:**

```bash
# macOS
brew install ffmpeg

# Ubuntu/Debian
sudo apt-get install ffmpeg

# Verify installation
ffmpeg -version
```

See `docs/recording.md` for full recording architecture documentation.

## Troubleshooting

### Docker services won't start

```bash
pnpm docker:down
pnpm docker:up
```

### Port conflicts

Check if ports are in use:

```bash
lsof -i :3000  # API
lsof -i :5432  # PostgreSQL
lsof -i :6379  # Redis
```

### Tauri build fails

Ensure Rust is installed:

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

## Next Steps

This skeleton provides:

- ✅ Monorepo structure with Turborepo
- ✅ Tauri desktop client with React
- ✅ NestJS API with health checks
- ✅ Worker service with BullMQ
- ✅ Shared TypeScript package
- ✅ Docker Compose for local infrastructure
- ✅ TypeScript strict mode everywhere
- ✅ Basic logging and error handling

To implement features, see:

- `CLAUDE.md` for engineering principles
- `services/api/CLAUDE.md` for API guidelines
- `services/worker/CLAUDE.md` for worker guidelines
- `apps/desktop-client/CLAUDE.md` for desktop client guidelines

## License

MIT
