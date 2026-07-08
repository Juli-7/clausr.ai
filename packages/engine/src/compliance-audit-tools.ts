import { initSession } from "./agent/loading/phases/init-phase";
import { createPipelineContext } from "./agent/pipeline/pipeline-context";
import { generateStepsFromChecks } from "./agent/loading/generate-steps";
import { executeLlmToolStep, parseLlmOutput } from "./agent/pipeline/executors/llm-executor";
import { generateCorrelationId } from "./agent/pipeline/errors";
import { getDocStore } from "./agent/user-info/vector-store";
import { logPipeline } from "./agent/pipeline/logger";
import {
  getComplianceSession,
  setCompliancePackStates,
  getCompliancePackStates,
  setCompliancePackAuditResult,
  setComplianceAgentResponse,
  setComplianceAuditDone,
  setComplianceAuditRunning,
} from "./agent/shared/memory/repository";
import type { ParsedCheck, CheckFieldType } from "./agent/loading/skill/check-parser";
import type { ExecutableStep, StepResult } from "./agent/pipeline/types";

export interface PackCheckState {
  state: "pending" | "ready" | "running" | "done" | "failed"
  depDepth: number
  dependsOn: string[]
  title: string
  stepNumber: number
  result?: { verdict: string; reasoning: string; finding: string; sourceCitation?: string[]; citationRef?: string[] }
  error?: string
}

export interface PackAuditSetup {
  skillName: string
  skillmd: string
  checks: ParsedCheck[]
  steps: ExecutableStep[]
}

export interface PackAuditState {
  state: "uninitialized" | "ready" | "running" | "done" | "failed"
  setup?: PackAuditSetup
  checkStates: Record<string, PackCheckState>
}

export interface SetupPackResult {
  ok: true
  packId: string
  checks: { id: string; title: string; depDepth: number; dependsOn: string[] }[]
}

export interface RunChecksResult {
  completed: number
  failed: number
  blocked: boolean
  allDone: boolean
  results: { checkId: string; verdict: string; reasoning: string }[]
  errors: { checkId: string; error: string }[]
}

export interface RetryCheckResult {
  resetChecks: string[]
  packState: string
}

export interface PackAuditStateResult {
  packState: string
  checks: Record<string, { state: string; depDepth: number; title: string; result?: { verdict: string; reasoning: string }; error?: string }>
}

export interface FinalizeAuditResult {
  auditDone: true
  packCount: number
}

function deepDependsOn(resolved: string[]): string[] {
  return resolved.filter(Boolean);
}

export async function setupPackAudit(sessionId: string, packId: string): Promise<SetupPackResult> {
  const { skill } = await initSession(packId, sessionId);
  const steps = generateStepsFromChecks(skill.checks, skill.regulationIds);

  const checkStates: Record<string, PackCheckState> = {};
  for (let i = 0; i < skill.checks.length; i++) {
    const check = skill.checks[i]!;
    const step = steps.find((s) => s.number === i + 1);
    const depField = check.dependsOn ? [check.dependsOn] : [];
    checkStates[check.field] = {
      state: "pending",
      depDepth: 0,
      dependsOn: depField,
      title: step?.title ?? check.field,
      stepNumber: i + 1,
    };
  }

  // Compute topological depths
  const depths = computeDepths(skill.checks);
  for (const check of skill.checks) {
    const cs = checkStates[check.field];
    if (cs) cs.depDepth = depths[check.field] ?? 1;
  }

  const setup: PackAuditSetup = {
    skillName: skill.name,
    skillmd: skill.skillmd,
    checks: skill.checks,
    steps,
  };

  const all = getCompliancePackStates(sessionId) as Record<string, PackAuditState>;
  all[packId] = { state: "ready", setup, checkStates } satisfies PackAuditState;
  setCompliancePackStates(sessionId, all);

  return {
    ok: true,
    packId,
    checks: skill.checks.map((c) => ({
      id: c.field,
      title: checkStates[c.field]?.title ?? c.field,
      depDepth: checkStates[c.field]?.depDepth ?? 1,
      dependsOn: checkStates[c.field]?.dependsOn ?? [],
    })),
  };
}

export async function runPendingChecks(
  sessionId: string,
  packId: string,
  maxConcurrency?: number
): Promise<RunChecksResult> {
  const limit = maxConcurrency ?? 20;

  const all = getCompliancePackStates(sessionId) as Record<string, PackAuditState>;
  const packState = all[packId];
  if (!packState || !packState.setup) {
    throw new Error(`Pack ${packId} not set up. Call setup_pack_audit first.`);
  }

  // Find ready checks (pending + all deps satisfied)
  const ready: string[] = [];
  for (const [checkId, cs] of Object.entries(packState.checkStates)) {
    if (cs.state !== "pending") continue;
    const depsSatisfied = cs.dependsOn.every(
      (dep) => packState.checkStates[dep]?.state === "done"
    );
    const depsFailed = cs.dependsOn.some(
      (dep) => packState.checkStates[dep]?.state === "failed"
    );
    if (depsFailed) {
      cs.state = "failed";
      cs.error = `Dependency ${cs.dependsOn.find((d) => packState.checkStates[d]?.state === "failed")} failed`;
      continue;
    }
    if (depsSatisfied) ready.push(checkId);
  }

  if (ready.length === 0) {
    // Check if we're done or blocked
    const allDone = Object.values(packState.checkStates).every(
      (cs) => cs.state === "done" || cs.state === "failed"
    );
    const blocked = !allDone && Object.values(packState.checkStates).some((cs) => cs.state === "failed");
    const results = collectResults(packState);
    setCompliancePackStates(sessionId, all);
    return {
      completed: 0, failed: 0, blocked, allDone,
      results: results.results, errors: results.errors,
    };
  }

  // Group by depDepth and execute one level
  const readyDepths = [...new Set(ready.map((id) => packState.checkStates[id]!.depDepth))].sort();
  const depth = readyDepths[0]!;
  const batch = ready.filter((id) => packState.checkStates[id]!.depDepth === depth);

  const correlationId = generateCorrelationId();
  const ctx = createPipelineContext(
    packState.setup.skillName,
    packState.setup.skillmd,
    sessionId,
    correlationId,
    packState.setup.checks,
    [],
    [],
  );

  const store = getDocStore();
  const storedFiles = await store.getFiles(sessionId);
  if (storedFiles.length > 0) {
    ctx.files.loadFiles(storedFiles);
  }

  packState.state = "running";
  for (const checkId of batch) {
    packState.checkStates[checkId]!.state = "running";
  }
  setCompliancePackStates(sessionId, all);
  setComplianceAuditRunning(sessionId, true);

  const completed: RunChecksResult["results"] = [];
  const errors: RunChecksResult["errors"] = [];

  const stepResults = await Promise.all(
    batch.map(async (checkId): Promise<{ ok: true; checkId: string; result: StepResult } | { ok: false; checkId: string; error: string }> => {
      const cs = packState.checkStates[checkId]!;
      const step = packState.setup!.steps.find((s) => s.number === cs.stepNumber);
      if (!step) return { ok: false, checkId, error: `Step ${cs.stepNumber} not found` };

      try {
        const result = await executeLlmToolStep(step, ctx);
        if (result.success) {
          return { ok: true, checkId, result };
        }
        return { ok: false, checkId, error: result.error ?? "Step failed" };
      } catch (err) {
        return { ok: false, checkId, error: err instanceof Error ? err.message : "Unknown error" };
      }
    })
  );

  for (const sr of stepResults) {
    if (sr.ok) {
      const cs = packState.checkStates[sr.checkId]!;
      cs.state = "done";

      const check = packState.setup.checks.find((c) => c.field === sr.checkId);
      const simpleResult = extractResult(sr.result, check);

      cs.result = simpleResult;
      completed.push({ checkId: sr.checkId, ...simpleResult });
    } else {
      const cs = packState.checkStates[sr.checkId]!;
      cs.state = "failed";
      cs.error = sr.error;
      errors.push({ checkId: sr.checkId, error: sr.error });
    }
  }

  // Write per-pack audit results incrementally
  const packItems = buildAuditItems(packState);
  setCompliancePackAuditResult(sessionId, packId, packItems);

  const allDone = Object.values(packState.checkStates).every(
    (cs) => cs.state === "done" || cs.state === "failed"
  );
  const blocked = !allDone && Object.values(packState.checkStates).some((cs) => cs.state === "failed");

  if (allDone) {
    packState.state = "done";
    // Store final agent response
    const agentResponse = await buildAgentResponse(packState, sessionId);
    setComplianceAgentResponse(sessionId, packId, JSON.stringify(agentResponse));
  }

  setCompliancePackStates(sessionId, all);

  if (allDone) {
    const allPacksDone = checkAllPacksDone(all);
    if (allPacksDone) {
      setComplianceAuditRunning(sessionId, false);
      setComplianceAuditDone(sessionId, true);
    }
  }

  return {
    completed: completed.length,
    failed: errors.length,
    blocked,
    allDone,
    results: completed,
    errors,
  };
}

export async function retryCheck(
  sessionId: string,
  packId: string,
  checkId: string
): Promise<RetryCheckResult> {
  const all = getCompliancePackStates(sessionId) as Record<string, PackAuditState>;
  const packState = all[packId];
  if (!packState) throw new Error(`Pack ${packId} not found`);

  // Reset the check + all transitive dependents
  const toReset = new Set<string>();
  const collectDependents = (id: string) => {
    toReset.add(id);
    for (const [cid, cs] of Object.entries(packState.checkStates)) {
      if (cs.dependsOn.includes(id) && !toReset.has(cid)) {
        collectDependents(cid);
      }
    }
  };
  collectDependents(checkId);

  for (const id of toReset) {
    const cs = packState.checkStates[id]!;
    cs.state = "pending";
    delete cs.result;
    delete cs.error;
  }

  packState.state = "ready";

  // Rebuild auditResults without the retried checks
  const session = getComplianceSession(sessionId);
  if (session) {
    const remainingItems = buildAuditItems(packState);
    setCompliancePackAuditResult(sessionId, packId, remainingItems);
  }

  setCompliancePackStates(sessionId, all);

  return {
    resetChecks: [...toReset],
    packState: "ready",
  };
}

export function getPackAuditState(
  sessionId: string,
  packId: string
): PackAuditStateResult | null {
  const all = getCompliancePackStates(sessionId) as Record<string, PackAuditState>;
  const packState = all[packId];
  if (!packState) return null;

  const checks: PackAuditStateResult["checks"] = {};
  for (const [id, cs] of Object.entries(packState.checkStates)) {
    checks[id] = {
      state: cs.state,
      depDepth: cs.depDepth,
      title: cs.title,
      result: cs.result,
      error: cs.error,
    };
  }

  return {
    packState: packState.state,
    checks,
  };
}

export async function finalizeAudit(sessionId: string): Promise<FinalizeAuditResult> {
  const all = getCompliancePackStates(sessionId) as Record<string, PackAuditState>;

  for (const [packId, packState] of Object.entries(all)) {
    const items = buildAuditItems(packState);
    setCompliancePackAuditResult(sessionId, packId, items);
    const agentResponse = await buildAgentResponse(packState, sessionId);
    setComplianceAgentResponse(sessionId, packId, JSON.stringify(agentResponse));
  }

  setComplianceAuditRunning(sessionId, false);
  setComplianceAuditDone(sessionId, true);

  return {
    auditDone: true,
    packCount: Object.keys(all).length,
  };
}

// ── Helpers ──

function computeDepths(checks: ParsedCheck[]): Record<string, number> {
  const memo = new Map<string, number>();
  const visiting = new Set<string>();

  function getDepth(field: string): number {
    const existing = memo.get(field);
    if (existing !== undefined) return existing;
    if (visiting.has(field)) return 1;

    const check = checks.find((c) => c.field === field);
    if (!check || !check.dependsOn) {
      memo.set(field, 1);
      return 1;
    }

    if (!checks.some((c) => c.field === check.dependsOn)) {
      memo.set(field, 1);
      return 1;
    }

    visiting.add(field);
    const depDepth = getDepth(check.dependsOn!);
    visiting.delete(field);

    const depth = depDepth + 1;
    memo.set(field, depth);
    return depth;
  }

  for (const check of checks) {
    getDepth(check.field);
  }

  const result: Record<string, number> = {};
  for (const check of checks) {
    result[check.field] = memo.get(check.field) ?? 1;
  }
  return result;
}

function extractResult(
  stepResult: StepResult,
  _check?: ParsedCheck
): { verdict: string; reasoning: string; finding: string; sourceCitation: string[]; citationRef: string[] } {
  if (!stepResult || !stepResult.success) {
    return { verdict: "FAIL", reasoning: "", finding: "missing", sourceCitation: [], citationRef: [] };
  }

  const streamedText = (stepResult.streamedTokens ?? []).join("");
  const toolResults = stepResult.toolResults ?? [];

  // Try to parse structured LLM output for citation data
  const parsed = parseLlmOutput(streamedText);
  const sourceCitation = parsed?.sourceCitation ?? [];
  const citationRef = parsed?.citationRef ?? [];

  // Check tool results for failure
  const failingTools = toolResults.filter((tr) => tr.status === "fail");
  if (failingTools.length > 0) {
    return {
      verdict: "FAIL",
      reasoning: streamedText.slice(0, 500),
      finding: failingTools.map((t) => t.name).join(", "),
      sourceCitation, citationRef,
    };
  }

  if (streamedText.length > 0) {
    return {
      verdict: parsed?.verdict ?? "PASS",
      reasoning: streamedText.slice(0, 500),
      finding: parsed?.value ?? streamedText.slice(0, 200),
      sourceCitation, citationRef,
    };
  }

  return { verdict: "PASS", reasoning: "", finding: "Conformant", sourceCitation: [], citationRef: [] };
}



function buildAuditItems(packState: PackAuditState): { name: string; desc: string; status: string; statusLabel: string; checks: { name: string; pass: boolean }[] }[] {
  return Object.entries(packState.checkStates).map(([checkId, cs]) => ({
    name: cs.title || checkId,
    desc: cs.result?.reasoning ?? "",
    status: cs.state === "done" ? "done" as const : cs.state === "failed" ? "err" as const : "wait" as const,
    statusLabel: cs.result?.verdict ?? "PENDING",
    checks: [],
  }));
}

function checkAllPacksDone(all: Record<string, PackAuditState>): boolean {
  if (Object.keys(all).length === 0) return false;
  return Object.values(all).every((ps) => ps.state === "done" || ps.state === "failed");
}

function collectResults(packState: PackAuditState): { results: RunChecksResult["results"]; errors: RunChecksResult["errors"] } {
  const results: RunChecksResult["results"] = [];
  const errors: RunChecksResult["errors"] = [];
  for (const [checkId, cs] of Object.entries(packState.checkStates)) {
    if (cs.state === "done" && cs.result) {
      results.push({ checkId, ...cs.result });
    } else if (cs.state === "failed" && cs.error) {
      errors.push({ checkId, error: cs.error });
    }
  }
  return { results, errors };
}

export async function resolveCitation(
  sessionId: string,
  ref: string,
): Promise<{
  ref: string; fileId: string; filename: string; fileUrl?: string;
  extractedText: string; keyExcerpt: string;
  pageNumber?: number; pageCount?: number;
  chunks?: { id: string; text: string; bbox?: { x: number; y: number; width: number; height: number }; wordBoxes?: { x: number; y: number; width: number; height: number }[]; pageNumber?: number; pageWidth?: number; pageHeight?: number }[];
} | null> {
  const m = ref.match(/^S(\d+)\.c(\d+)$/);
  if (!m) return null;
  const fileIdx = parseInt(m[1]!, 10) - 1;
  const chunkIdx = parseInt(m[2]!, 10);
  let files: { fileId: string; filename: string; dataUrl?: string; pageCount?: number; chunks: { id: string; text: string; bbox?: unknown; wordBoxes?: unknown; pageNumber?: number; pageWidth?: number; pageHeight?: number }[] }[];
  try {
    files = await getDocStore().getFiles(sessionId);
  } catch {
    return null;
  }
  const file = files[fileIdx];
  if (!file) return null;
  const chunk = file.chunks[chunkIdx - 1];
  if (!chunk) return null;
  return {
    ref,
    fileId: file.fileId,
    filename: file.filename,
    fileUrl: file.dataUrl,
    extractedText: chunk.text ?? "",
    keyExcerpt: (chunk.text ?? "").slice(0, 200),
    pageNumber: chunk.pageNumber,
    pageCount: file.pageCount,
    chunks: [{
      id: chunk.id,
      text: chunk.text,
      bbox: chunk.bbox as { x: number; y: number; width: number; height: number } | undefined,
      wordBoxes: chunk.wordBoxes as { x: number; y: number; width: number; height: number }[] | undefined,
      pageNumber: chunk.pageNumber,
      pageWidth: chunk.pageWidth,
      pageHeight: chunk.pageHeight,
    }],
  };
}

async function buildAgentResponse(packState: PackAuditState, sessionId: string): Promise<Record<string, unknown>> {
  const checkResults = Object.entries(packState.checkStates)
    .filter(([_, cs]) => cs.state === "done")
    .map(([checkId, cs]) => ({
      name: checkId,
      type: "qualitative",
      finding: cs.result?.finding ?? "",
      verdict: cs.result?.verdict ?? "PASS",
      citationRef: cs.result?.citationRef ?? [],
      sourceCitation: cs.result?.sourceCitation ?? [],
    }));

  // Store only raw ref strings — no eager file resolution
  const allRefs = [...new Set(checkResults.flatMap((cr) => cr.sourceCitation))];
  const sourceCitations = allRefs.map((ref) => ({ ref }));

  // Build content with citation markers
  const sections: Record<string, string> = {};
  for (const cr of checkResults) {
    const body = (cr.finding || `**Verdict: ${cr.verdict}**`).replace(
      /\[([A-Za-z0-9.-]+)\]/g,
      '<cite class="source-citation-marker" data-source-citation="$1">[$1]</cite>'
    );
    sections[cr.name] = body;
  }
  sections._checkResults = JSON.stringify(
    checkResults.map((cr) => ({ name: cr.name, verdict: cr.verdict }))
  );

  const content = checkResults
    .map((cr) => {
      const body = (cr.finding || `**Verdict:** ${cr.verdict}`).replace(
        /\[([A-Za-z0-9.-]+)\]/g,
        '<cite class="source-citation-marker" data-source-citation="$1">[$1]</cite>'
      );
      return `### ${cr.name}\n\n${body}`;
    })
    .join("\n\n");

  return {
    content,
    checkResults,
    sections,
    reasoning: "",
    citations: [],
    sourceCitations,
    clauseTexts: {},
    round: 1,
    sessionId,
  };
}


