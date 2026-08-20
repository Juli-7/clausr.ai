# API Layer Map

Every API endpoint in `apps/clausr/src/app/api/` and what each layer contributes.

## Layer Legend

| Layer | Location | Role |
|---|---|---|
| **engine** | `@clausr/engine` (`~/clausr.ai/packages/engine/`) | Domain value: sessions, pipeline, compliance, skills, LLM orchestration |
| **platform-core** | `@raipple/platform-core` | Shared SaaS primitives: auth, RBAC, orgs, users, usage, audit, settings, session CRUD, CSRF, rate-limit, email |
| **app** | `apps/clausr/src/` | Thin UI + route handlers. Routes import from both layers. `@/lib/` holds compliance seed data, session builder, tool definitions, trivial re-exports |

## Endpoints

### Auth

| Endpoint | engine | platform-core | `@/lib` (app) |
|---|---|---|---|
| `POST /api/auth/login` | — | `verifyCredentials`, `createSessionToken`, `getSessionCookieOptions` | `csrfGuard`, `checkRateLimit`, `logger` |
| `POST /api/auth/logout` | — | `getSessionCookieOptions` | — |
| `POST /api/auth/register` | — | `createUserRegistration`, `createEmailVerificationToken`, `getUserByEmail`, `resetUserPassword`, `sendVerificationEmail` | `csrfGuard`, `checkRateLimit`, `logger` |
| `GET /api/auth/me` | — | `authenticateRequest`, `AuthError` | — |
| `GET /api/auth/verify` | — | `verifyEmailWithToken` | `logger` |
| `PATCH /api/auth/password` | — | `requireAuth`, `updatePassword`, `AuthError`, `handleAuthError` | `csrfGuard`, `checkRateLimit`, `logger` |

### Admin

| Endpoint | engine | platform-core | `@/lib` (app) |
|---|---|---|---|
| `GET/POST /api/admin/organizations` | — | `requireOrgAdmin`, `logAuditEvent`, `createOrganization`, `listOrganizationsForAdmin`, `addMemberToOrganization` | — |
| `GET/DELETE /api/admin/organizations/[id]` | — | `requireOrgAdmin`, `AuthError`, `handleAuthError`, `deleteOrganization`, `getOrgById`, `getOrgMembers` | `csrfGuard`, `checkRateLimit` |
| `PATCH/DELETE /api/admin/organizations/[id]/members` | — | `requireOrgAdmin`, `addMemberToOrganization`, `removeMemberFromOrganization`, `logAuditEvent`, `getOrgConfig`, `getMemberRole`, `countOrgMembersByRole` | `csrfGuard`, `checkRateLimit` |
| `GET/PATCH /api/admin/organizations/[id]/config` | — | `requireOrgAdmin`, `getOrgConfig`, `updateOrgConfig`, `logAuditEvent` | — |
| `GET/POST /api/admin/users` | — | `requireOrgAdmin`, `createUser`, `addMemberToOrganization`, `getOrgConfig`, `countOrgMembersByRole`, `logAuditEvent`, `listUsersWithMemberships` | `csrfGuard`, `checkRateLimit` |
| `PATCH/DELETE /api/admin/users/[id]` | — | `requireOrgAdmin`, `setUserActive`, `updateUserRole`, `deleteUser`, `AuthError`, `handleAuthError`, `isUserInSameOrg` | — |
| `GET /api/admin/usage` | — | `requireOrgAdmin`, `getAllUsage`, `getUsageSummary` | — |
| `GET /api/admin/usage/[tenantId]` | — | `requireOrgAdmin`, `getUsageByTenant`, `getUsagePerUser`, `AuthError` | — |
| `GET /api/admin/audit` | — | `requireOrgAdmin`, `queryAuditLog`, `getAuthDb` | — |

### Sessions

| Endpoint | engine | platform-core | `@/lib` (app) |
|---|---|---|---|
| `GET /api/sessions` | — | `requireAuth`, `listSessions` | `logger` |
| `GET/DELETE /api/sessions/[id]` | `getConversationHistory`, `getResponsesForSession`, `getSessionMeta`, `getSessionFiles`, `getComplianceSession` | `requireAuth`, `deleteSession` | `logger`, compliance seed (`getPack`) |
| `POST /api/sessions/[id]/star` | — | `requireAuth`, `toggleStar` | `logger` |
| `POST /api/sessions/[id]/share` | — | `requireAuth`, `toggleShare` | `logger` |

### Pipeline

| Endpoint | engine | platform-core | `@/lib` (app) |
|---|---|---|---|
| `POST /api/setup` | `SetupRequestSchema`, `loadSkill`, `setupSession`, `getLessonOverrides`, `saveSessionFiles` | `requireAuth`, `logAuditEvent`, `recordUsage`, `createSession` | `csrfGuard`, `checkRateLimit`, `logger`, `file-limits`, regulation-seed (side-effect) |
| `POST /api/chat` | `ChatRequestSchema`, `hasSessionSetup`, `orchestratePipeline` | `requireAuth`, `recordUsage`, `getOrgConfig`, `getOrgUsageCost` | `csrfGuard`, `checkRateLimit`, `logger` |

### Skills & Scripts

| Endpoint | engine | platform-core | `@/lib` (app) |
|---|---|---|---|
| `GET/POST/PUT/DELETE /api/skills` | `listSkills`, `loadSkill`, `parseChecks` | `requireAuth` | `csrfGuard`, `checkRateLimit`, `logger` |
| `POST /api/skills/generate` | `createModel`, `parseChecks`, `extractFileContent` | `requireAuth` | `logger` |
| `GET /api/scripts` | `loadSkill` | `requireAuth` | `logger` |
| `POST /api/scripts/[name]` | `loadSkill`, `runScript`, `ComplianceCheckSchema` | `requireAuth` | `logger` |

### Compliance

| Endpoint | engine | platform-core | `@/lib` (app) |
|---|---|---|---|
| `GET /api/compliance/packs` | — | — | seed (`packs`, `allRegs`, `allInds`) |
| `GET /api/compliance/packs/[id]` | — | — | seed (`getPack`) |
| `POST /api/compliance/session` | `getOrCreateSession`, `ensureComplianceSession` | `createSession` | session-builder (`buildSession`) |
| `GET /api/compliance/session/[id]` | — | — | session-builder (`buildSession`) |
| `POST /api/compliance/session/[id]/chat` | `complianceChat`, `orchestratePipeline`, `setupSkill`, `hasSessionSetup`, `getComplianceSession`, `setComplianceAgentResponse`, `addUserMessage` | — | session-builder, tool-registry |
| `POST /api/compliance/session/[id]/tool` | `getComplianceSession` | — | tool-registry (`getTool`) |
| `POST /api/compliance/session/[id]/files` | `getComplianceSession`, `addComplianceFile` | — | session-builder (`buildSession`) |
| `GET /api/compliance/session/[id]/export/[docType]` | `generateDocx` | — | session-builder, seed (`getPack`) |
| `PATCH /api/compliance/session/[id]/comments` | `getComplianceSession`, `setComplianceComments` | — | — |
| `GET /api/compliance/session/[id]/audit/stream` | `createModel`, `setupSkill`, `hasSessionSetup`, `orchestratePipeline`, `getComplianceSession`, compliance setters | — | seed (`getPack`), types (`AuditItem`) |
| `GET /api/compliance/sessions` | `getAllComplianceSessions` | — | — |

### Settings & Profile

| Endpoint | engine | platform-core | `@/lib` (app) |
|---|---|---|---|
| `GET/POST /api/settings` | — | `getSetting`, `setSetting`, `requireAuth`, `requireOrgAdmin` | `csrfGuard`, `checkRateLimit`, `logger` |
| `GET /api/profile` | — | `requireAuth`, `getUserUsage`, `getUsagePerUser` | — |

### Agent

| Endpoint | engine | platform-core | `@/lib` (app) |
|---|---|---|---|
| `POST /api/agent/evolution-confirm` | `saveLessonOverride`, `getDb` | `requireAuth`, `logAuditEvent` | `csrfGuard`, `checkRateLimit`, `logger` |

### Infrastructure

| Endpoint | engine | platform-core | `@/lib` (app) |
|---|---|---|---|
| `GET /api/health` | — | — | — |
| `POST /api/preview/docx` | — | — | `csrfGuard`, `checkRateLimit`, `file-limits` |
| `GET /api/files/[sessionId]/[filename]` | — | — | — |
| `GET /api/files/[sessionId]/[filename]/html` | — | — | — |
| `GET /api/files/[sessionId]/[filename]/page/[pageNumber]` | — | — | — |

## Summary

- **42 route files**, 44 endpoints (star + share are separate files under `sessions/[id]`)
- **16 endpoints** use engine
- **23 endpoints** use platform-core
- **5 endpoints** use neither (pure Next.js + Node)
- All compliance v2 routes (`/api/compliance/*`) rely entirely on engine + `@/lib/compliance/*` — zero platform-core
- All admin + auth routes rely entirely on platform-core — zero engine
- `/api/setup` and `/api/chat` are the main coordination points where both layers appear
- **No `packages/compliance-engine/` exists** — compliance logic lives in engine + `@/lib/compliance/*`
