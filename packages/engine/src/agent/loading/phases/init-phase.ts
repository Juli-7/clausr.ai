import { loadSkill } from "../../loading/skill/loader";
import { getOrCreateSession, addUserMessage } from "../../shared/memory/repository";
import { getResponsesForSession } from "../../shared/memory/repository";
import { pruneOldSessions } from "../../loading/cleanup";
import { PipelineError } from "../../pipeline/errors";
import { logPipeline } from "../../pipeline/logger";
import type { PipelineContext, CheckResult } from "../../pipeline/pipeline-context";

/**
 * Once-per-session: load (or prepare for auto-generation) a skill
 * and create the DB session row. Does NOT create PipelineContext
 * or add user messages — those are split across setup and pipeline layers.
 */
export async function initSession(
  skillName: string | undefined,
  sessionId: string,
): Promise<{
  skill: {
    name: string;
    description: string;
    triggers: string[];
    skillmd: string;
    scripts: { name: string; path: string; desc: string; params: string }[];
    checks: import("../../loading/skill/check-parser").ParsedCheck[];
    regulationIds: string[];
  };
  isAutoSkill: boolean;
}> {
  const isAutoSkill = !skillName;
  let skill;

  if (skillName) {
    skill = loadSkill(skillName);
    if (!skill) {
      throw new PipelineError("SKILL_NOT_FOUND", `Skill "${skillName}" not found`);
    }
    logPipeline(`[INIT-SESSION] skill loaded: "${skill.name}" scripts=${skill.scripts.length} regulationIds=${skill.regulationIds.length}`);
  } else {
    logPipeline("[INIT-SESSION] auto-skill mode: no skill chosen, will generate after file processing");
    skill = {
      name: "auto-generated",
      description: "",
      triggers: [],
      skillmd: "",
      scripts: [],
      checks: [],
      regulationIds: [],
    };
  }

  getOrCreateSession(sessionId, skill.name);
  return { skill, isAutoSkill };
}

/**
 * Per-pipeline-turn: add user message, prune sessions, and restore
 * previous step outputs + check results from the last response.
 * The PipelineContext is already created/restored by the caller.
 */
export async function initPipelineTurn(
  ctx: PipelineContext,
  sessionId: string,
  message: string,
  correlationId: string,
): Promise<void> {
  ctx.correlationId = correlationId;
  addUserMessage(sessionId, message);
  try { pruneOldSessions(); } catch (err) {
    logPipeline(`session pruning failed (non-critical): ${err instanceof Error ? err.message : String(err)}`);
  }

  // Load previous turns from DB
  const previousResponses = getResponsesForSession(sessionId);
  ctx.previousTurns = previousResponses.map((r) => ({
    turnNumber: r.round,
    userMessage: "",
    checkResults: [] as CheckResult[],
    reasoningSummary: r.reasoning?.slice(0, 300) ?? "",
  }));

  if (ctx.previousTurns.length > 0) {
    logPipeline(`[PIPELINE-TURN] loaded ${ctx.previousTurns.length} previous turn(s)`);
  }

  // Restore previous step outputs from the most recent response's reasoningSteps
  const lastResponse = previousResponses[previousResponses.length - 1];
  if (lastResponse?.reasoningSteps && lastResponse.reasoningSteps.length > 0) {
    for (const rs of lastResponse.reasoningSteps) {
      ctx.steps.write(rs.stepNumber, restoreStepOutput(rs.body));
    }
    logPipeline(`[PIPELINE-TURN] restored ${lastResponse.reasoningSteps.length} step output(s) from previous turn`);
  }

  // Restore previous CheckResults from the most recent response's persisted _checkResults
  if (lastResponse?.sections) {
    const sections = lastResponse.sections as Record<string, unknown>;
    const rawCheckResults = sections._checkResults;

    if (typeof rawCheckResults === "string") {
      try {
        const parsed = JSON.parse(rawCheckResults) as CheckResult[];
        ctx.checks.addResults(parsed);
        logPipeline(`[PIPELINE-TURN] restored ${parsed.length} CheckResult(s) from previous turn`);
      } catch (err) {
        logPipeline(`[PIPELINE-TURN] ⚠ failed to parse _checkResults: ${err instanceof Error ? err.message : String(err)}`);
      }
    } else {
      logPipeline(`[PIPELINE-TURN] ⚠ _checkResults not found in sections, reconstructing from findings`);
      // Fallback: restore from findings (FAIL-only)
      const findingsMap: Record<string, string> = {};
      const findingsEntry = sections.findings;
      if (findingsEntry && typeof findingsEntry === "object") {
        for (const [field, finding] of Object.entries(findingsEntry as Record<string, string>)) {
          findingsMap[field] = finding;
        }
      }
      const restoredResults: CheckResult[] = [];
      for (const check of ctx.skill.checks) {
        const stepNum = ctx.skill.checks.indexOf(check) + 1;
        const finding = findingsMap[check.field];
        const stepOutput = ctx.steps.read(stepNum);
        if (finding) {
          restoredResults.push({ name: check.field, type: check.type.kind === "number" ? "numerical" : "qualitative", finding, verdict: "FAIL", citationRef: check.clause ? [check.clause] : [], sourceCitation: [] });
        } else if (stepOutput !== undefined) {
          const outputText = typeof stepOutput === "string" ? stepOutput : JSON.stringify(stepOutput);
          restoredResults.push({ name: check.field, type: check.type.kind === "number" ? "numerical" : "qualitative", finding: outputText, verdict: "PASS", citationRef: check.clause ? [check.clause] : [], sourceCitation: [] });
        }
      }
      if (restoredResults.length > 0) {
        ctx.checks.addResults(restoredResults);
        logPipeline(`[PIPELINE-TURN] fallback: reconstructed ${restoredResults.length} CheckResult(s)`);
      }
    }
  }
}

function restoreStepOutput(body: string): unknown {
  const trimmed = body.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try { return JSON.parse(trimmed); } catch { return body; }
  }
  return body;
}
