# Repository Implementation Analysis

**Analysis Date**: 2026-05-28  
**Purpose**: Identify what's implemented, what's missing, and prioritize next tasks for MVP

---

## Current Repository Status

### ✅ Infrastructure (100% Complete)

**Docker Compose Services**:
- PostgreSQL 16 (port 5432) ✅
- Redis 7 (port 6379) ✅
- LiveKit Server (ports 7880-7882) ✅
- MinIO S3-compatible storage (ports 9000-9001) ✅
- All with health checks configured ✅

**Monorepo Structure**:
- Turborepo + pnpm workspaces ✅
- TypeScript strict mode everywhere ✅
- Shared package with workspace references ✅
- Environment configuration files ✅

### ✅ Recording System (95% Complete)

**Database Schema**:
- `recordings` table with 19 columns ✅
- `audit_logs` table with JSONB metadata ✅
- SQL migrations with proper indexes ✅
- TypeORM entities configured ✅

**API Service**:
- LiveKit Egress service wrapper ✅
- Recording lifecycle implementation ✅
- Audit logging service ✅
- Start/stop/status endpoints ✅
- Database persistence ✅
- State machine (6 states) ✅

**Worker Service**:
- BullMQ job processor ✅
- FFmpeg command builder with tests ✅
- Recording post-processing ✅
- Database updates ✅
- Error handling with retry ✅
- FFmpeg log capture ✅

**Missing from Recording**:
- ❌ Instructor permission validation (placeholder exists)
- ❌ Download endpoint implementation (URL returned but not served)

### ⚠️ Core Platform Features (5% Complete)

**Session/Class Management**: 
- Types defined in shared package ✅
  - `Session` interface with all fields ✅
  - `SessionStatus` enum ✅
- ❌ NO database entity
- ❌ NO controller
- ❌ NO service
- ❌ NO endpoints:
  - `POST /classes` (create session)
  - `GET /classes/:id` (get session)
  - `POST /classes/:id/start` (start class)
  - `POST /classes/:id/end` (end class)

**Authentication**: 
- Types defined ✅
  - `User` interface ✅
  - `UserRole` enum ✅
- ❌ NO database entity
- ❌ NO auth module
- ❌ NO magic link implementation
- ❌ NO JWT strategy
- ❌ NO endpoints:
  - `POST /auth/magic-link`
  - `POST /auth/verify`

**Invite System**:
- ❌ NO `Invite` type in shared package
- ❌ NO database entity
- ❌ NO service
- ❌ NO endpoints:
  - `POST /classes/:id/invites`
  - `POST /join/resolve`

**LiveKit Token Issuance**:
- Types defined ✅
  - `LiveKitToken` interface ✅
- LiveKit client SDK in desktop app ✅
- ❌ NO token service implementation
- ❌ NO endpoint:
  - `POST /join/token`

**Attendance Tracking**:
- Type defined ✅
  - `Attendance` interface ✅
- ❌ NO database entity
- ❌ NO service
- ❌ NO endpoints

**Admin APIs**:
- ❌ NO endpoints:
  - `GET /admin/classes`
  - `GET /admin/attendance`

### ⚠️ Desktop Client (5% Complete)

**Current State**:
- Tauri + React scaffold ✅
- LiveKit client SDK installed ✅
- Basic health check UI ✅
- Empty directories:
  - `components/` (empty)
  - `pages/` (empty)
  - `hooks/` (empty)
  - `lib/` (empty)

**Missing Screens** (per desktop-client/CLAUDE.md):
- ❌ Download/install landing handoff
- ❌ Join class screen
- ❌ Waiting room
- ❌ Live classroom (video grid)
- ❌ Reconnecting state
- ❌ Class ended screen
- ❌ Recording unavailable/error

**Missing Features**:
- ❌ Invite link parsing
- ❌ Authentication flow
- ❌ LiveKit room connection
- ❌ Video grid rendering
- ❌ Screen share display
- ❌ Chat UI
- ❌ Connection quality indicator
- ❌ Reconnection logic
- ❌ Role-based permissions (instructor vs attendee)

---

## What Works Right Now

1. **Health Checks**: API `/health` endpoint returns database + redis status
2. **Recording Lifecycle**: Complete server-side recording with LiveKit Egress
   - Start recording via `POST /classes/:id/recording/start`
   - Stop recording via `POST /classes/:id/recording/stop`
   - Status check via `GET /classes/:id/recording`
   - Worker processes with FFmpeg
   - Audit logging
3. **Database Migrations**: `pnpm migrate` creates tables
4. **Infrastructure**: All services start via `pnpm docker:up`
5. **Shared Types**: Complete type definitions for all entities
6. **Desktop Client**: Opens and checks API health

---

## What's Missing for MVP

### Critical Path (Blocks User Flow)

1. **Auth System** (No user can authenticate)
   - Magic link generation and verification
   - JWT token issuance
   - User database entity
   
2. **Session Management** (No classes exist)
   - Create class/session endpoint
   - Session database entity
   - Start/end class logic
   
3. **Invite System** (No way to share class links)
   - Generate signed invite tokens
   - Resolve invite links
   - Invite database entity
   
4. **LiveKit Token Service** (Can't join video room)
   - Issue room tokens with proper permissions
   - Instructor vs attendee roles
   
5. **Desktop Client UI** (Can't use the platform)
   - All 7 screens missing
   - LiveKit integration
   - Video rendering
   - Chat
   
6. **Attendance Tracking** (No record of who attended)
   - Track join/leave events
   - Store attendance records

### Important but Not Blocking

7. **Admin Dashboard** (Can't monitor platform)
   - List classes endpoint
   - Attendance reports
   
8. **Recording Download** (Can't access recordings)
   - Serve final MP4 files
   - Signed URL generation
   
9. **Instructor Permission Validation** (Security gap)
   - Verify instructor role before recording actions

---

## Risk Areas

### 🔴 High Risk

1. **No Authentication**: Recording endpoints are completely open
   - Anyone can start/stop recordings
   - No user identity
   - Security vulnerability

2. **No Session Management**: Recording endpoints reference sessions that don't exist
   - Can't test recording flow end-to-end
   - Recording service expects `session_id` but sessions aren't created

3. **Desktop Client Empty**: 95% of UI is missing
   - Can't join classes
   - Can't view video
   - Can't test instructor/attendee flows

### 🟡 Medium Risk

4. **LiveKit Integration Incomplete**: 
   - Egress service exists but may not work without actual LiveKit
   - No token service (can't authenticate to LiveKit rooms)
   - Desktop client has SDK but no integration code

5. **Testing Gap**: 
   - Recording has test guide but can't test end-to-end
   - No way to create test sessions
   - No way to generate test invite links

### 🟢 Low Risk

6. **Minor Features**: Admin APIs, download endpoint, analytics

---

## Recommended Next 5 Tasks (Prioritized)

### Task 1: Implement Auth System (CRITICAL)
**Why**: Blocks everything else. Need user identity before sessions, invites, permissions.

**Files to Create**:
- `services/api/src/database/entities/user.entity.ts`
- `services/api/src/auth/auth.module.ts`
- `services/api/src/auth/auth.controller.ts`
- `services/api/src/auth/auth.service.ts`
- `services/api/src/auth/jwt.strategy.ts`
- `services/api/src/auth/dto/magic-link.dto.ts`
- `services/api/src/database/migrations/003_create_users_table.sql`

**Files to Modify**:
- `services/api/src/app.module.ts` (add AuthModule)
- `packages/shared/src/types.ts` (add auth request/response types)

**Endpoints to Implement**:
- `POST /auth/magic-link` - Request magic link
- `POST /auth/verify` - Verify magic link token, return JWT
- `GET /auth/me` - Get current user

**Acceptance Criteria**:
- Can request magic link by email
- Can verify token and receive JWT
- JWT contains user ID and role
- Can use JWT for authenticated requests

---

### Task 2: Implement Session Management (CRITICAL)
**Why**: Recordings reference sessions. Need sessions before testing recording flow.

**Files to Create**:
- `services/api/src/database/entities/session.entity.ts`
- `services/api/src/sessions/sessions.module.ts`
- `services/api/src/sessions/sessions.controller.ts`
- `services/api/src/sessions/sessions.service.ts`
- `services/api/src/sessions/dto/create-session.dto.ts`
- `services/api/src/database/migrations/004_create_sessions_table.sql`

**Files to Modify**:
- `services/api/src/app.module.ts` (add SessionsModule)
- `services/api/src/recording/recording.service.ts` (validate session exists)

**Endpoints to Implement**:
- `POST /classes` - Create session (instructor only)
- `GET /classes/:id` - Get session details
- `POST /classes/:id/start` - Start class (set status=LIVE)
- `POST /classes/:id/end` - End class (set status=ENDED)
- `GET /classes` - List instructor's classes

**Acceptance Criteria**:
- Instructor can create class session
- Session has LiveKit room name
- Can start/end class
- Recording service validates session exists

---

### Task 3: Implement Invite System (CRITICAL)
**Why**: No way to join classes without invite links.

**Files to Create**:
- `services/api/src/database/entities/invite.entity.ts`
- `services/api/src/invites/invites.module.ts`
- `services/api/src/invites/invites.controller.ts`
- `services/api/src/invites/invites.service.ts`
- `services/api/src/database/migrations/005_create_invites_table.sql`
- `packages/shared/src/types.ts` (add Invite interface)

**Endpoints to Implement**:
- `POST /classes/:id/invites` - Generate invite link (instructor only)
- `POST /join/resolve` - Resolve invite token, return session details
- `GET /invites/:token` - Get invite details for landing page

**Acceptance Criteria**:
- Instructor can generate signed invite link
- Link contains JWT with session ID and expiry
- Anyone with link can resolve to session details
- Expired invites are rejected

---

### Task 4: Implement LiveKit Token Service (CRITICAL)
**Why**: Can't join video rooms without tokens.

**Files to Create**:
- `services/api/src/livekit/token.service.ts`
- `services/api/src/join/join.module.ts`
- `services/api/src/join/join.controller.ts`
- `services/api/src/join/join.service.ts`

**Files to Modify**:
- `services/api/src/livekit/livekit.module.ts` (export TokenService)
- `services/api/src/app.module.ts` (add JoinModule)

**Endpoints to Implement**:
- `POST /join/token` - Issue LiveKit room token
  - Input: invite token + user name
  - Output: LiveKit access token with permissions

**Acceptance Criteria**:
- Generates valid LiveKit access tokens
- Instructor tokens have publish permissions
- Attendee tokens are view-only
- Tokens scoped to specific room
- Tokens expire (1 hour)

---

### Task 5: Build Desktop Client Join Flow (CRITICAL)
**Why**: Need to test end-to-end flow. This unblocks actual usage.

**Files to Create**:
- `apps/desktop-client/src/pages/JoinClass.tsx`
- `apps/desktop-client/src/pages/WaitingRoom.tsx`
- `apps/desktop-client/src/pages/Classroom.tsx`
- `apps/desktop-client/src/components/VideoGrid.tsx`
- `apps/desktop-client/src/components/Chat.tsx`
- `apps/desktop-client/src/lib/livekit.ts`
- `apps/desktop-client/src/hooks/useRoom.ts`
- `apps/desktop-client/src/hooks/useParticipants.ts`

**Files to Modify**:
- `apps/desktop-client/src/App.tsx` (add routing)

**Features to Implement**:
1. Parse invite token from URL
2. Show join form (name input)
3. Call `/join/token` API
4. Connect to LiveKit room
5. Show waiting room until instructor starts
6. Show video grid when class starts
7. Display local video
8. Display remote videos
9. Basic chat UI
10. Leave class button

**Acceptance Criteria**:
- Can open invite link in desktop client
- Can enter name and join
- Can see own video
- Can see instructor video when they join
- Can send/receive chat messages
- Can leave gracefully

---

## Exact Files for First Patch (Task 1: Auth)

### New Files to Create (7 files)

1. **`services/api/src/database/migrations/003_create_users_table.sql`**
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'attendee',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
```

2. **`services/api/src/database/entities/user.entity.ts`**
- TypeORM entity matching User interface
- Enum for UserRole

3. **`services/api/src/auth/dto/magic-link.dto.ts`**
- Request DTO with email validation
- Response DTO with link

4. **`services/api/src/auth/auth.service.ts`**
- `requestMagicLink(email)` - Generate signed JWT, send email (stub)
- `verifyToken(token)` - Verify JWT, find/create user, return access token
- `validateUser(userId)` - Load user by ID

5. **`services/api/src/auth/jwt.strategy.ts`**
- Passport JWT strategy
- Extract user from token

6. **`services/api/src/auth/auth.controller.ts`**
- `POST /auth/magic-link`
- `POST /auth/verify`
- `GET /auth/me`

7. **`services/api/src/auth/auth.module.ts`**
- Import JwtModule, PassportModule
- Export AuthService

### Files to Modify (3 files)

8. **`services/api/src/app.module.ts`**
- Import AuthModule

9. **`services/api/src/database/database.module.ts`**
- Add UserEntity to entities array

10. **`packages/shared/src/types.ts`**
- Add auth DTOs:
  - `MagicLinkRequest`
  - `MagicLinkResponse`
  - `VerifyTokenRequest`
  - `VerifyTokenResponse`

### Testing the Patch

```bash
# Run migration
cd services/api
pnpm migrate

# Start API
pnpm dev

# Test endpoints
curl -X POST http://localhost:3000/auth/magic-link \
  -H "Content-Type: application/json" \
  -d '{"email": "instructor@example.com"}'

# Copy token from logs, then verify
curl -X POST http://localhost:3000/auth/verify \
  -H "Content-Type: application/json" \
  -d '{"token": "<magic-link-token>"}'

# Use JWT to get user
curl http://localhost:3000/auth/me \
  -H "Authorization: Bearer <jwt-token>"
```

---

## Suggested Implementation Order (Full MVP)

1. ✅ **Recording System** (Done)
2. 🔴 **Auth System** (Task 1) - 1 day
3. 🔴 **Session Management** (Task 2) - 1 day
4. 🔴 **Invite System** (Task 3) - 1 day
5. 🔴 **LiveKit Token Service** (Task 4) - 0.5 days
6. 🔴 **Desktop Client Join Flow** (Task 5) - 2 days
7. 🟡 **Attendance Tracking** - 0.5 days
8. 🟡 **Admin APIs** - 1 day
9. 🟡 **Recording Download** - 0.5 days
10. 🟡 **Desktop Client Polish** (reconnect, error states) - 1 day
11. 🟢 **Testing & Bug Fixes** - 2 days

**Total Estimate**: 10-12 days for working MVP

---

## Dependencies Between Tasks

```
Auth System
  ↓
Session Management → Invite System → LiveKit Token Service → Desktop Client
  ↓                      ↓                    ↓
Recording (already done) ↓              Join Flow
                         ↓
                    Attendance Tracking
                         ↓
                    Admin APIs
```

**Critical Path**: Auth → Sessions → Invites → LiveKit Tokens → Desktop Client

---

## Current Code Statistics

- **API Service**: 722 lines TypeScript (16 files)
- **Worker Service**: ~200 lines TypeScript (5 files)
- **Desktop Client**: ~50 lines TypeScript (2 files with content)
- **Shared Package**: ~200 lines TypeScript (3 files)
- **Documentation**: ~5,000 lines (10+ markdown files)
- **Database Migrations**: 2 files (recordings, audit_logs)

**Total**: ~1,200 lines of production code, all in recording system

---

## Blockers & Questions

1. **Email Service**: Magic link needs email delivery. Options:
   - Stub for MVP (log to console)
   - Use SendGrid/Mailgun
   - Use local SMTP server

2. **Frontend Routing**: Desktop client needs router
   - Add React Router?
   - Use Tauri deep linking?

3. **LiveKit Testing**: Need to test with actual LiveKit server
   - Docker container is configured
   - Need to verify Egress works
   - Need to test token generation

4. **Instructor Identification**: How does first user become instructor?
   - Email domain whitelist?
   - Manual database seed?
   - Self-service instructor signup?

---

## Summary

**Status**: Recording system complete (95%), core platform features missing (5%)

**Bottleneck**: No authentication → can't create sessions → can't test anything end-to-end

**Next Step**: Implement auth system (Task 1) to unblock all other work

**After Auth**: Build in order: Sessions → Invites → LiveKit Tokens → Desktop UI

**Timeline**: ~10-12 days of focused work for working MVP

**Risk**: Desktop client is completely empty. Largest unknown.
