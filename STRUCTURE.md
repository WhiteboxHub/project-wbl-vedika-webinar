# Project Structure

Complete overview of the webinar platform monorepo.

## Directory Layout

```
project-wbl-vedika-webinar/
├── apps/                           # Application packages
│   └── desktop-client/            # Tauri desktop client
│       ├── src/                   # React frontend
│       │   ├── components/        # React components (empty, ready for features)
│       │   ├── hooks/            # Custom React hooks (empty)
│       │   ├── lib/              # Utilities (empty)
│       │   ├── pages/            # Page components (empty)
│       │   ├── App.tsx           # Root component with health check
│       │   ├── main.tsx          # React entry point
│       │   └── index.css         # Global styles
│       ├── src-tauri/            # Rust backend
│       │   ├── src/              
│       │   │   └── main.rs       # Tauri entry point
│       │   ├── icons/            # App icons (placeholder)
│       │   ├── build.rs          # Build script
│       │   ├── Cargo.toml        # Rust dependencies
│       │   └── tauri.conf.json   # Tauri configuration
│       ├── index.html            # HTML template
│       ├── vite.config.ts        # Vite bundler config
│       ├── package.json          # Dependencies
│       ├── tsconfig.json         # TypeScript config
│       └── .env.example          # Environment template
│
├── services/                      # Backend services
│   ├── api/                      # NestJS REST API
│   │   ├── src/
│   │   │   ├── health/           # Health check module
│   │   │   │   ├── health.controller.ts
│   │   │   │   ├── health.service.ts
│   │   │   │   └── health.module.ts
│   │   │   ├── config/           # Configuration module
│   │   │   │   └── config.module.ts
│   │   │   ├── common/           # Shared utilities
│   │   │   │   └── logger.ts     # Structured logging
│   │   │   ├── app.module.ts     # Root module
│   │   │   └── main.ts           # API entry point
│   │   ├── package.json          # Dependencies
│   │   ├── nest-cli.json         # NestJS config
│   │   ├── tsconfig.json         # TypeScript config
│   │   └── .env.example          # Environment template
│   │
│   └── worker/                   # Background job processor
│       ├── src/
│       │   ├── jobs/             # Job processors
│       │   │   └── recording.processor.ts
│       │   ├── config/           # Configuration
│       │   │   └── config.ts
│       │   ├── common/           # Shared utilities
│       │   │   └── logger.ts     # Structured logging
│       │   └── main.ts           # Worker entry point
│       ├── package.json          # Dependencies
│       ├── tsconfig.json         # TypeScript config
│       └── .env.example          # Environment template
│
├── packages/                      # Shared packages
│   └── shared/                   # Common types and constants
│       ├── src/
│       │   ├── types.ts          # TypeScript interfaces
│       │   ├── constants.ts      # Shared constants
│       │   └── index.ts          # Package exports
│       ├── package.json          # Dependencies
│       └── tsconfig.json         # TypeScript config
│
├── docker/                        # Docker configurations
│   └── livekit.yaml              # LiveKit server config
│
├── .claude/                       # Claude Code settings
│   ├── settings.json
│   └── prompts/                  # Custom prompts
│
├── docker-compose.yml             # Local infrastructure
├── package.json                   # Root package.json
├── pnpm-workspace.yaml           # pnpm workspace config
├── turbo.json                    # Turborepo config
├── .gitignore                    # Git ignore rules
├── .prettierrc                   # Prettier config
├── .prettierignore               # Prettier ignore rules
├── .editorconfig                 # Editor configuration
├── .env.example                  # Root environment template
├── Makefile                      # Convenience commands
├── CLAUDE.md                     # Engineering guidelines
├── README.md                     # Main documentation
├── GETTING_STARTED.md            # Setup guide
└── STRUCTURE.md                  # This file
```

## Package Relationships

```
┌─────────────────┐
│ desktop-client  │
│   (Tauri+React) │
└────────┬────────┘
         │
         │ imports @webinar/shared
         │ calls API via HTTP
         │
         ▼
┌─────────────────┐      ┌─────────────────┐
│    api (NestJS) │      │ worker (BullMQ) │
│                 │      │                 │
│  - REST API     │      │  - Recording    │
│  - Auth         │◄────►│  - Background   │
│  - LiveKit SDK  │      │    jobs         │
└────────┬────────┘      └────────┬────────┘
         │                        │
         │                        │
         │ imports @webinar/shared
         │                        │
         ▼                        ▼
┌──────────────────────────────────────────┐
│         @webinar/shared                   │
│  - Types (User, Session, Recording, etc.) │
│  - Constants (limits, expiry times)      │
└──────────────────────────────────────────┘
         ▲
         │
         │ used by all packages
```

## Infrastructure Services

```
┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│  PostgreSQL  │   │    Redis     │   │   LiveKit    │   │    MinIO     │
│              │   │              │   │              │   │              │
│  Port: 5432  │   │  Port: 6379  │   │ Ports: 7880- │   │ Ports: 9000, │
│              │   │              │   │        7882  │   │        9001  │
│  - User data │   │  - Cache     │   │  - WebRTC    │   │  - Recording │
│  - Sessions  │   │  - Job queue │   │  - SFU       │   │    storage   │
│  - Recordings│   │              │   │              │   │              │
└──────────────┘   └──────────────┘   └──────────────┘   └──────────────┘
```

## Key Files

### Configuration

- **Root**: `package.json`, `turbo.json`, `pnpm-workspace.yaml`
- **Environment**: `.env.example`, `services/api/.env.example`, `services/worker/.env.example`
- **Docker**: `docker-compose.yml`, `docker/livekit.yaml`

### Type Definitions

- **Shared Types**: `packages/shared/src/types.ts`
  - User, Session, Recording, ChatMessage, Attendance
  - API response wrappers
  - Health check types

### Entry Points

- **API**: `services/api/src/main.ts`
- **Worker**: `services/worker/src/main.ts`
- **Desktop (React)**: `apps/desktop-client/src/main.tsx`
- **Desktop (Rust)**: `apps/desktop-client/src-tauri/src/main.rs`

### Health Checks

- **API**: `services/api/src/health/health.service.ts`
  - Checks PostgreSQL connection
  - Checks Redis connection
  - Returns structured status

## Build Outputs

- **API**: `services/api/dist/`
- **Worker**: `services/worker/dist/`
- **Shared**: `packages/shared/dist/`
- **Desktop**: `apps/desktop-client/dist/` (web build)
- **Desktop Installers**: `apps/desktop-client/src-tauri/target/release/bundle/`

## Development Ports

| Service        | Port | Protocol |
|----------------|------|----------|
| API            | 3000 | HTTP     |
| Desktop (dev)  | 5173 | HTTP     |
| PostgreSQL     | 5432 | TCP      |
| Redis          | 6379 | TCP      |
| LiveKit        | 7880 | WS/HTTP  |
| LiveKit RTC    | 7882 | UDP      |
| MinIO API      | 9000 | HTTP     |
| MinIO Console  | 9001 | HTTP     |

## TypeScript Paths

All packages use path aliases:

- `@webinar/shared` → `packages/shared/src`
- `@/*` → `src/*` (desktop client only)

Configured in each `tsconfig.json`.

## Workspace Scripts

Run from root:

- `pnpm dev` - Start all services in watch mode
- `pnpm build` - Build all packages
- `pnpm test` - Run all tests
- `pnpm lint` - Lint all packages
- `pnpm clean` - Remove all build artifacts
- `pnpm docker:up` - Start infrastructure
- `pnpm docker:down` - Stop infrastructure
- `pnpm docker:logs` - View infrastructure logs

## Next Steps

Once you've explored the structure:

1. Read `GETTING_STARTED.md` to set up your environment
2. Review `CLAUDE.md` for engineering principles
3. Check `README.md` for detailed documentation
4. Start implementing features according to MVP scope
