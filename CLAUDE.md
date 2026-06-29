# LLM Call Design

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
