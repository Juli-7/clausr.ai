# raipple-saas Architecture

## Workspaces

```
@raipple/platform-core  ← auth, usage, audit, RBAC (closed source)
@raipple/clausr         ← Next.js app (closed source, all UI)
@clausr/engine          ← agent pipeline, skill loading, DB (open source, file: dep)
```

## @clausr/engine — Layers Used by raipple-saas

The engine is at `clausr.ai/packages/engine/src/`. These are the functions raipple-saas imports
directly (internal pipeline calls are not listed):

| Engine Layer | Imported Functions | What It Does |
|---|---|---|
| **loading** (`agent/loading/`) | `setupSession`, `listSkills`, `loadSkill` | Reads SKILL.md from disk, parses Checks section, processes uploaded files into text chunks, creates PipelineContext. |
| **pipeline** (`agent/pipeline/`) | `orchestratePipeline`, `runScript` | Main agent loop — async generator that streams SSE events (status, token, tool-result, done). Runs ad-hoc scripts via `runScript`. |
| **shared/memory** (`agent/shared/memory/`) | `getAllSessions`, `getConversationHistory`, `getResponsesForSession`, `deleteSession`, `toggleStar`, `getSessionMeta`, `getSessionFiles`, `saveSessionFiles`, `getSetting`, `setSetting`, `getDb`, `hasSessionSetup`, `getLessonOverrides`, `saveLessonOverride` | All SQLite CRUD for sessions, messages, responses, settings, file storage, session setup checks, and per-tenant lesson overrides. |
| **schemas** | `SetupRequestSchema`, `ChatRequestSchema`, `ComplianceCheckSchema` | Zod schemas for request validation. |

Layers NOT called directly by raipple-saas (called internally by pipeline):
**evaluation** — compliance report validation and confidence scoring
**present** — report formatting and DOCX export
**user-info** — PDF/DOCX/OCR text extraction from uploaded files
**knowledge** — regulation API for citation lookup
**llm** — LLM provider factory (reads LLM_API_KEY, LLM_PROVIDER from env)

## @raipple/platform-core — Function Breakdown

| Module | Exported Functions | What It Does |
|---|---|---|
| **auth** (`src/auth/`) | `verifyCredentials`, `createSessionToken`, `verifySessionToken`, `getSessionCookieOptions`, `extractTokenFromRequest`, `authenticateRequest`, `requireAuth`, `requireRole`, `requireOrgAdmin`, `AuthError`, `handleAuthError`, `createUser`, `seedSuperadmin`, `getUserById`, `listUsers`, `setUserActive`, `updateUserRole`, `deleteUser`, `updatePassword`, `getAuthDb`, `closeAuthDb`, `createOrganization`, `deleteOrganization`, `listOrganizations`, `addMemberToOrganization`, `removeMemberFromOrganization`, `getOrgConfig`, `updateOrgConfig` | Password hashing (bcryptjs), JWT creation/verification (jose), cookie management, RBAC middleware (requireAuth checks cookie, requireRole additionally checks platformRole or membership role, requireOrgAdmin checks org admin or superadmin), user/org CRUD, org config. DB connection via `getAuthDb()`/`closeAuthDb()`. DB: auth.db. |
| **usage** (`src/usage/`) | `recordUsage`, `getUsageByTenant`, `getUsageSummary`, `getUsagePerUser`, `getUserUsage`, `getAllUsage` | Tracks LLM token count and cost per session per tenant. Called from chat route's finally block. DB: auth.db (usage_events table). |
| **audit** (`src/audit/`) | `logAuditEvent`, `queryAuditLog` | Immutable audit trail for setup, evolution, org creation events. DB: auth.db (audit_log table). |
| **rbac** (`src/rbac/`) | `PlatformRole`, `TenantRole`, `UserWithRoles`, `PLATFORM_ROLES`, `TENANT_ROLES`, `ROLE_HIERARCHY`, `hasMinPlatformRole`, `hasMinTenantRole`, `isValidPlatformRole`, `isValidTenantRole` | Role definitions and helpers: platform roles (superadmin / operator), tenant roles (admin / expert / tester), hierarchy checks. |

## Auth Flow

```
Browser → Next.js middleware (middleware.ts) → checks session cookie
  ├─ no cookie → redirect to /login
  └─ has cookie → pass through

/login → POST /api/auth/login
  → @raipple/platform-core: verifyCredentials(email, password)
    → getAuthDb() → better-sqlite3 to auth.db
    → bcryptjs.compare(password, row.password_hash)
    → returns AuthenticatedUser { id, email, name, platformRole, memberships }
  → createSessionToken(user)
    → jose.SignJWT({ userId, role }) with JWT_SECRET → cookie

Subsequent requests (most routes)
  → requireAuth(request) middleware
    → extractTokenFromRequest → jose.jwtVerify
    → getUserById → returns AuthenticatedUser or throws 401
  → requireRole("superadmin")(request)
    → requireAuth + checks platformRole or membership.role
  → requireOrgAdmin(request, orgId?)
    → requireAuth + checks platformRole is superadmin or membership.role is admin

/api/auth/me (exception — non-throwing)
  → authenticateRequest(request)
    → returns AuthenticatedUser or null (no 401)
```

## Engine Integration

### Setup (/api/setup)
```
POST /api/setup { skillName, sessionId, files, message }
  → requireAuth(request)
  → setupSession({ skillName, sessionId, tenantId, files, message, lessonOverrides })
    → @clausr/engine: loads SKILL.md, parses checks, creates PipelineContext
    → processes files into chunks, saves to DB
  → saveSessionFiles(sessionId, JSON.stringify(files))  ← persists file dataUrls for history
  → logAuditEvent(...)
```

### Chat (/api/chat)
```
POST /api/chat { message, sessionId }
  → requireAuth(request)
  → hasSessionSetup(sessionId)
  → ReadableStream → orchestratePipeline(sessionId, message)
    → @clausr/engine: async generator yielding SSE events:
      - { type: "status", phase } — progress updates
      - { type: "token", text, stepNumber } — streaming reasoning
      - { type: "tool-result", stepNumber, results } — compliance check results
      - { type: "error", error } — error message
      - { type: "done", response } — final AgentResponse
  → recordUsage(...) in finally block ← tracks token count
```

### Sessions (/api/sessions)
```
GET /api/sessions
  → requireAuth → getAllSessions(tenantId, userId)
    → @clausr/engine: SELECT from sessions + subqueries for messages/responses

GET /api/sessions/[id]
  → requireAuth → getConversationHistory(id) + getResponsesForSession(id)
    + getSessionMeta(id) + getSessionFiles(id)  ← restores files with dataUrl
```

## Frontend Component Tree

```
layout.tsx
  └─ AppProvider (context: activeSkill, activeSession)
  └─ Sidebar
      ├─ SkillsDrawer → selects skill → setActiveSkill
      └─ HistoryDrawer → loads session → loadSession(id, skillName)
  └─ page.tsx → ChatView

ChatView (state owner)
  ├─ FileUploadPanel (left) — file selection, skill badge, setup button
  ├─ DocumentPanel (center) — renders ChatTurn[] as compliance reports
  ├─ ChatInput (bottom) — sends messages, SSE stream handler
  └─ ReasoningPanel (right) — step-by-step audit trail
```

### State Management
- **AppContext** (app-context.tsx): activeSkillId/Name, activeSessionId, loadSession/clearSession
- **ChatView** (local state): turns[], attachedFiles[], loading/setup flags, stepConfirmations, pendingComments
- No global state library — all via props + context

### Session Loading Flow
```
HistoryDrawer click → loadSession(id, skillName)
  → AppContext: sets activeSessionId + activeSkillName
  → ChatView useEffect fires:
    1. Reset: turns=[], attachedFiles=[], error=null (immediate)
    2. Fetch: GET /api/sessions/[id]
    3. Restore: setTurns(reconstructed), setAttachedFiles(sessionFiles)
    4. setActiveSkill from session metadata
```

## Data Layer

### Databases
| Database | Module | Path | Contents |
|----------|--------|------|----------|
| auth.db | platform-core | ./data/auth.db | users, organizations, organization_members, usage_events, audit_log |
| skill-agent.db | engine | ./data/skill-agent.db | sessions, messages, responses, settings, lesson_overrides |

Both are SQLite with WAL mode. Auth DB is managed by platform-core, engine DB by @clausr/engine.

### DB Connection (platform-core)
```
getAuthDb() — singleton, lazy init on first call
  → creates data/ dir if needed
  → runs auth + usage + audit schemas
  → caches connection for process lifetime
```

### DB Connection (engine)
```
getDb() — same pattern but for engine's own DB
  → reads DATABASE_PATH env or defaults to ./data/skill-agent.db
```

## Usage Tracking

```
recordUsage({ tenantId?, userId?, sessionId?, eventType, quantity?, unit?, cost?, metadata? })
  → INSERT INTO usage_events — called from chat route's finally block

getUsageByTenant(tenantId, options?) — per-tenant queries
getUsageSummary(tenantId) — aggregate per tenant
getUsagePerUser(tenantId) — per-user breakdown within tenant
getUserUsage(userId) — individual user totals
getAllUsage(options?) — superadmin overview
```

## Admin Panel

```
/api/admin/users (GET) — org admin+
  → SQL: users LEFT JOIN organization_members + organizations
  → Returns: user list with JSON memberships (scoped to admin's orgs)

/api/admin/organizations (GET, POST) — org admin+
  → GET: list orgs with member counts (scoped to admin's orgs)
  → POST: create org with crypto.randomUUID() (superadmin only)

/api/admin/usage (GET) — org admin+
  → getAllUsage({ from, to }) (superadmin: all tenants; org admin: own tenant)

/api/admin/audit (GET) — org admin+
  → queryAuditLog({ tenantId?, userId?, action?, limit? })

/api/admin/organizations/[id]/config (PATCH) — org admin for that org
  → updateOrgConfig(orgId, { llmModel, llmProvider, usageLimit })

/api/admin/organizations/[id]/members (POST, DELETE) — org admin for that org
  → addMemberToOrganization / removeMemberFromOrganization

/admin page — tabbed UI: Organizations | Audit Log
  → Organization rows expand to show members, usage config, usage summary
```

## Storage

### Filesystem Layout (Production)

```
/app/
  .next/                     ← compiled Next.js output
  public/                    ← static assets
  package.json
  next.config.ts
  node_modules/              ← includes @raipple/platform-core/dist and @clausr/engine (file: dep)
  skills/                    ← SKILL.md files mounted as read-only volume
  data/                      ← writable, persisted on Docker volume
    auth.db                  ← users, orgs, usage_events, audit_log
    auth.db-wal              ← SQLite WAL (concurrent read optimization)
    auth.db-shm              ← SQLite shared memory
    skill-agent.db           ← sessions, messages, responses, settings
    kb.sqlite                ← regulation knowledge base (created at runtime by engine)
    uploads/                 ← uploaded file chunks per session (created at runtime)
    pipeline-debug.log       ← engine debug logging (created at runtime)
```

### What Goes Where

| Data | Location | Persistence | Why |
|------|----------|-------------|-----|
| User accounts, roles | auth.db | Docker volume | Core auth data |
| Organization membership | auth.db | Docker volume | Multi-tenant RBAC |
| Usage events (cost, tokens) | auth.db | Docker volume | Billing/metrics |
| Audit log | auth.db | Docker volume | Compliance trail |
| Chat sessions, messages | skill-agent.db | Docker volume | Conversation history |
| LLM settings (provider, model) | skill-agent.db | Docker volume | User preferences |
| Lesson override text | skill-agent.db | Docker volume | Per-tenant evolution |
| Regulation knowledge base | kb.sqlite | Docker volume | Seeded from engine data |
| SKILL.md files | ./skills/ volume (ro) | Host bind mount | Authored skills, read-only at runtime |
| Uploaded file chunks | data/uploads/ | Docker volume | Per-session document processing |
| Next.js build output | .next/ | Ephemeral | Rebuilt on deploy |
| LLM API keys* | .env | Not in container | Set via docker-compose environment |

*\*API keys are never stored in the database — only in runtime environment variables.*

### Docker Volumes

Defined in docker-compose.yml:

```yaml
volumes:
  raipple-data:       ← persists auth.db, skill-agent.db, kb.sqlite, uploads/
  caddy-data:         ← Caddy SSL certificates and HTTP cache
  caddy-config:       ← Caddy configuration

bind mounts:
  ./skills → /app/skills (read-only)
```

## Deployment Plan

### Infrastructure

- **Host**: Tencent Cloud VPS (veLinux/CentOS 7+ or Ubuntu 22.04+, ~$10-15/mo)
- **Container runtime**: Docker + docker-compose
- **Reverse proxy**: Caddy (auto-SSL via Let's Encrypt)
- **Domain**: `raipple-saas.com` (or subdomain)

### Build Pipeline

```
GitHub (raipple-saas + clausr.ai repos)
  └─ GitHub Actions
       ├─ Checkout both repos
       ├─ pnpm install
       ├─ pnpm -r exec tsc --noEmit        ← type check
       ├─ pnpm --filter @raipple/clausr build  ← Next.js build
       ├─ docker buildx build               ← multi-stage Docker build
       └─ docker push to registry (or direct deploy via rsync)
```

### Docker Build (Multi-stage)

1. **engine-builder**: Install dependencies, copy clausr.ai source
2. **platform-builder**: Install + build @raipple/platform-core
3. **app-builder**: Copy apps/clausr, install, build next.js
4. **runner**: Minimal node:20-alpine — copies .next/, public/, package.json, next.config.ts, node_modules/ (incl. @raipple/platform-core dist), skills/, creates /app/data

The build context must include both `raipple-saas/` and `clausr.ai/` directories because of the `file:` dependency. Build from parent directory:

```bash
# From /Users/7ian/ (parent of both repos)
docker buildx build -t raipple-saas:latest -f raipple-saas/Dockerfile .
```

### Docker Compose Services

```
app       → raipple-saas:latest, port 3000, env vars from .env, raipple-data volume
caddy     → caddy:2-alpine, ports 80+443, auto-SSL, depends on app healthy
```

### First-time Setup

1. Provision VPS (veLinux/CentOS 7+ or Ubuntu 22.04+)
2. Install Docker + docker-compose-plugin
3. Clone both repos (or use pre-built image)
4. Create `.env` with AUTH_SECRET + LLM_API_KEY
5. Run `docker compose up -d`
6. Exec into app container: `pnpm seed-admin` to create superadmin
7. Create organization via `/admin` UI
8. Upload SKILL.md files to `./skills/` bind mount

### Scaling Path

- **Post-MVP**: Move from SQLite to PostgreSQL (swap better-sqlite3 → pg driver)
- **Multi-container**: Split auth server + engine workers + frontend
- **File storage**: Replace dataUrl storage → S3-compatible object storage
- **Session isolation**: The engine already supports per-session PipelineContext — no changes needed for concurrent sessions

## Key Env Vars

| Var | Used By | Required |
|-----|---------|----------|
| AUTH_SECRET | platform-core auth (session.ts) | Yes (used as JWT signing key) |
| LLM_API_KEY | engine LLM factory | Yes |
| LLM_PROVIDER | engine LLM factory | Default: openai (runtime effective: deepseek via DB init) |
| LLM_MODEL | engine LLM factory | Default: deepseek-v4-flash |
| LLM_BASE_URL | engine LLM factory | Optional override |
| SUPERADMIN_PASSWORD | seed-admin CLI | Seed only |
| SUPERADMIN_EMAIL | seed-admin CLI | Optional, default: admin@clausr.ai |
| DATABASE_PATH | engine getDb() | Optional, default: ./data/skill-agent.db |
| AUTH_DB_PATH | platform-core getAuthDb() | Optional, default: ./data/auth.db |
| LOG_LEVEL | engine logger | Optional, default: info |
