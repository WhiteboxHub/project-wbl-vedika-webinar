# Quick Reference

Essential commands and information for daily development.

## Initial Setup (First Time Only)

```bash
# Install dependencies
pnpm install

# Start infrastructure
pnpm docker:up

# Copy environment files
cp .env.example .env
cp services/api/.env.example services/api/.env
cp services/worker/.env.example services/worker/.env

# Build shared package
cd packages/shared && pnpm build && cd ../..
```

## Daily Development

```bash
# Start everything (recommended)
pnpm dev

# Or start individually in separate terminals:
cd services/api && pnpm dev           # Terminal 1
cd services/worker && pnpm dev        # Terminal 2
cd apps/desktop-client && pnpm tauri:dev  # Terminal 3
```

## Docker Commands

```bash
pnpm docker:up        # Start all infrastructure
pnpm docker:down      # Stop all infrastructure
pnpm docker:logs      # View logs
docker compose ps     # Check status
```

## Build Commands

```bash
pnpm build            # Build everything
pnpm test             # Run tests
pnpm lint             # Lint code
pnpm clean            # Clean build artifacts
```

## Health Checks

```bash
# API
curl http://localhost:3000/health

# PostgreSQL
docker exec -it webinar-postgres pg_isready -U webinar

# Redis
docker exec -it webinar-redis redis-cli ping

# LiveKit
curl http://localhost:7880
```

## Ports Reference

| Service          | Port | URL                          |
|------------------|------|------------------------------|
| API              | 3000 | http://localhost:3000        |
| Desktop (dev)    | 5173 | http://localhost:5173        |
| PostgreSQL       | 5432 | postgresql://localhost:5432  |
| Redis            | 6379 | redis://localhost:6379       |
| LiveKit          | 7880 | ws://localhost:7880          |
| MinIO API        | 9000 | http://localhost:9000        |
| MinIO Console    | 9001 | http://localhost:9001        |

## MinIO Access

- Console: http://localhost:9001
- Username: `minioadmin`
- Password: `minioadmin`

## Directory Shortcuts

```bash
# Navigate to packages
cd apps/desktop-client
cd services/api
cd services/worker
cd packages/shared
```

## Common Issues

### Port in use
```bash
lsof -i :3000  # Find process
kill -9 <PID>  # Kill it
```

### Docker stuck
```bash
pnpm docker:down
docker compose down -v  # WARNING: deletes data
pnpm docker:up
```

### Shared package changes not reflected
```bash
cd packages/shared
pnpm build
```

### Tauri first build slow
This is normal - first build compiles all Rust dependencies (2-5 min).
Subsequent builds are fast.

### Recording not working
```bash
# Check FFmpeg is installed
ffmpeg -version

# Create recordings directory
mkdir -p /var/recordings
# or use custom path in .env files

# Check worker logs
cd services/worker
pnpm dev
```

## File Locations

- **Types**: `packages/shared/src/types.ts`
- **Constants**: `packages/shared/src/constants.ts`
- **API Health**: `services/api/src/health/`
- **API Recording**: `services/api/src/recording/`
- **Worker Jobs**: `services/worker/src/jobs/`
- **FFmpeg Utils**: `services/worker/src/utils/ffmpeg.ts`
- **Desktop UI**: `apps/desktop-client/src/`
- **Tauri Config**: `apps/desktop-client/src-tauri/tauri.conf.json`
- **Recording Docs**: `docs/recording.md`

## Environment Variables

All `.env` files use same defaults for local dev:

```bash
DATABASE_URL=postgresql://webinar:webinar@localhost:5432/webinar_db
REDIS_URL=redis://localhost:6379
LIVEKIT_URL=ws://localhost:7880
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=secret
JWT_SECRET=your-secret-key-change-in-production
API_PORT=3000
NODE_ENV=development
```

## Documentation

- `README.md` - Complete project documentation
- `GETTING_STARTED.md` - Setup guide
- `STRUCTURE.md` - Project structure overview
- `CLAUDE.md` - Engineering principles
- `QUICK_REFERENCE.md` - This file

## Useful Make Commands

```bash
make help         # Show all commands
make install      # Install dependencies
make dev          # Start dev servers
make docker-up    # Start Docker
make docker-down  # Stop Docker
make clean        # Clean build artifacts
```

## Production Build

```bash
# Build all services
pnpm build

# Build desktop installers (macOS/Windows)
cd apps/desktop-client
pnpm tauri:build

# Installers in: src-tauri/target/release/bundle/
```

## Git Workflow

```bash
# Check status
git status

# Commit changes
git add .
git commit -m "feat: description"

# Push
git push origin <branch>
```

## Emergency Shutdown

```bash
# Stop all Node processes
killall node

# Stop Docker
pnpm docker:down

# Or hard stop everything
docker compose kill
```

## Getting Help

- Check `GETTING_STARTED.md` for detailed setup
- Review `STRUCTURE.md` for architecture
- Read `CLAUDE.md` for coding standards
- Search issues in the monorepo
