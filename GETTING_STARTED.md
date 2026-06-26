# Getting Started

This guide will help you set up the webinar platform for local development.

## Initial Setup

### 1. System Prerequisites

Ensure you have the following installed:

```bash
# Check Node.js version (should be >= 20.0.0)
node --version

# Check pnpm version (should be >= 9.0.0)
pnpm --version

# Check Docker is running
docker --version
docker compose version

# Check Rust (needed for Tauri)
rustc --version
cargo --version
```

If Rust is not installed:

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source $HOME/.cargo/env
```

### 2. Clone and Install

```bash
# Navigate to project
cd project-wbl-vedika-webinar

# Install dependencies (this will take a few minutes)
pnpm install
```

### 3. Start Infrastructure

Start all backing services (PostgreSQL, Redis, LiveKit, MinIO):

```bash
# Start services in background
pnpm docker:up

# Verify all services are healthy
docker compose ps
```

Expected output:

```
NAME                 STATUS
webinar-postgres     Up (healthy)
webinar-redis        Up (healthy)
webinar-livekit      Up
webinar-minio        Up (healthy)
```

If any service shows "unhealthy", check logs:

```bash
pnpm docker:logs
```

### 4. Configure Environment

Environment files are pre-configured for local development:

```bash
# Copy root env
cp .env.example .env

# Copy service envs
cp services/api/.env.example services/api/.env
cp services/worker/.env.example services/worker/.env
cp apps/desktop-client/.env.example apps/desktop-client/.env
```

Default values work out of the box.

### 5. Build Shared Package

The shared package must be built first:

```bash
cd packages/shared
pnpm build
cd ../..
```

### 6. Start Services

Open three terminals and run:

**Terminal 1: API Server**

```bash
cd services/api
pnpm dev
```

Wait until you see:

```
API server running on http://localhost:3000
```

**Terminal 2: Worker Service**

```bash
cd services/worker
pnpm dev
```

Wait until you see:

```
Worker service started with concurrency 5
```

**Terminal 3: Desktop Client**

```bash
cd apps/desktop-client
pnpm tauri:dev
```

The desktop app window will open. The first build takes 2-5 minutes as Rust compiles.

## Verify Setup

### Check API Health

```bash
curl http://localhost:3000/health
```

Expected response:

```json
{
  "status": "ok",
  "timestamp": "2026-05-28T12:34:56.789Z",
  "services": {
    "database": "ok",
    "redis": "ok"
  }
}
```

### Check Desktop Client

In the desktop app, click "Check Connection". You should see "Connected".

## Development Workflow

### Running All Services Together

Instead of three terminals, use:

```bash
pnpm dev
```

This runs all services in parallel using Turborepo.

### Making Changes

1. **Shared types**: Edit `packages/shared/src/types.ts`, run `pnpm build` in that directory
2. **API**: Changes auto-reload via NestJS watch mode
3. **Worker**: Changes auto-reload via ts-node
4. **Desktop**: Vite auto-reloads React, Rust changes require full rebuild

### Building for Production

```bash
# Build everything
pnpm build

# Build specific package
cd services/api
pnpm build

# Build desktop installers
cd apps/desktop-client
pnpm tauri:build
```

## Common Issues

### Port Already in Use

```bash
# Find process using port
lsof -i :3000

# Kill it
kill -9 <PID>
```

### Docker Services Stuck

```bash
# Stop and remove everything
pnpm docker:down

# Remove volumes (WARNING: deletes data)
docker compose down -v

# Start fresh
pnpm docker:up
```

### Tauri Build Fails on macOS

You may need Xcode command line tools:

```bash
xcode-select --install
```

### Rust Compilation Slow

First Tauri build compiles many dependencies. Subsequent builds are much faster.

### Database Connection Errors

Ensure PostgreSQL is running:

```bash
docker exec -it webinar-postgres pg_isready -U webinar
```

### Redis Connection Errors

Ensure Redis is running:

```bash
docker exec -it webinar-redis redis-cli ping
```

## Next Steps

- Read `CLAUDE.md` for engineering principles
- Check `README.md` for full project documentation
- Explore `packages/shared/src/types.ts` to understand data models
- Review health check implementation in `services/api/src/health/`

## Shutting Down

Stop all services:

```bash
# Stop API, worker, desktop (Ctrl+C in each terminal)

# Stop Docker services
pnpm docker:down
```

To preserve data, omit the `-v` flag. To remove all data:

```bash
docker compose down -v
```
