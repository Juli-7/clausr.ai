# clausr.ai — Monorepo

Monorepo with three packages:

- `packages/engine` — `@clausr/engine`: compliance engine (LLM pipeline, docs, packs, SQLite)
- `packages/platform-core` — `@clausr/platform-core`: auth, RBAC, sessions, usage, audit, settings
- `apps/clausr` — `@clausr/app`: Next.js app (chat UI, API routes, admin)

## LLM Call Design

## streamText (not streamObject)

`executeLlmToolStep` uses `streamText` with JSON fence-stripping/parsing rather than `streamObject`.

**Why:** No provider SDK supports structured output + tool calling in a single reliable pass. `streamText` with tools gives us:
- Tool execution during generation (`checkCompliance` tool for numerical checks)
- `maxSteps` control over tool-calling rounds
- Per-round usage tracking via `onStepFinish`
- Proper abort/timeout

Revisit if `streamObject` ever supports tools with equivalent control.

## LLM Call Sites

All in `packages/engine/src/`:

| Function | Method | Caching |
|---|---|---|
| `executeLlmToolStep()` in `agent/pipeline/executors/llm-executor.ts` | `streamText` | `createModel({ cache: true })` |
| `complianceChat()` in `compliance-chat.ts` | `streamText` | `createModel({ cache: true })` |
| `callLLM()` in `skill-generator.ts` | `generateText` | `createModel({ cache: true })` |

All prompts centralized in `agent/pipeline/prompts/index.ts`.

## Data Flow

```
SKILL.md Checks → parseChecks → ParsedCheck[]
  → generateStepsFromChecks → ExecutableStep[]
    → executeLlmToolStep() per step
      → streamText({ system + user message + tools })
      → parseLlmOutput() → {value, sourceCitation, citationRef, verdict}
      → buildCheckResult() → CheckResult
      → ctx.checks.addResults() → finalizePhase() → AgentResponse
```

Output format is flat: `{"value": "narrative", "sourceCitation": ["S1.c3"], "citationRef": ["R48.6.2"], "verdict": "PASS"}`.
Legacy nested format `{"field": {...}}` is also parsed for backward compatibility.

## VPS Deploy Checklist

When developing a new feature, check these before merge:

0. **Clear `.next` on significant route/import changes** — Turbopack's HMR can leave stale module graph entries when new routes or imports are added (especially packages pulled via new imports). If the app breaks after a code change with no clear cause, `rm -rf apps/clausr/.next && restart` fixes it. This is a Turbopack limitation, not a project bug.

1. **System deps** — if feature calls a CLI tool (`ffmpeg`, `pdftotext`, `sox`, etc.), add to `setup.sh`
2. **File paths** — no hardcoded `/Users/...` or `/tmp`. Use `os.tmpdir()`, `path.join()`, or configurable paths
3. **Case sensitivity** — `import ./Utils` works on macOS but fails on Linux if file is `utils.ts`
4. **Temp files** — always clean up. VPS disk is small
5. **Concurrency** — VPS has 1-2 cores. Don't `Promise.all` 50 heavy jobs at once
6. **Timeouts** — set explicit timeouts on DB, file processing, external tools
7. **Locale / encoding** — Chinese VPS may be `C.UTF-8` or `zh_CN.UTF-8`
8. **Non-root user** — VPS runs as `www-data`/`node`, not your user. Check permissions, `~/.config`, temp dirs
9. **Memory** — likely 512MB–2GB. Stream files, never `readFileSync` everything
10. **Process manager** — test via `systemd`/`pm2`, not just `npm run dev`. Working dir, env, PATH all differ

## Deployment Architecture

- **Don't use `output: "standalone"`** — runs directly from repo via `next start`. Full `node_modules` is kept intact.
- **Build on VPS** — `git pull` → `pnpm install` → `pnpm build` → `systemctl restart`. No artifact upload/download.
- **Systemd service** — runs `node node_modules/next/dist/bin/next start` from `apps/clausr/`.
- **Data symlink** — `apps/clausr/data -> ../../data` (relative to repo root's `data/`).
- **CI deploy** — simple SSH: pull, install, build, restart. No standalone copy step.
