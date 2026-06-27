import { generateText } from "ai";
import { createModel } from "./agent/llm/factory";
import {
  setCompliancePackAuditResult,
  addUserMessage,
} from "./agent/shared/memory/repository";

interface PackAuditCheck {
  id: string;
  title: string;
  desc: string;
}

interface PackAuditPack {
  id: string;
  title: string;
  desc: string;
  methodology: string;
  checks: PackAuditCheck[];
}

export type PackAuditEvent =
  | { type: "pack-start"; packId: string; packTitle: string }
  | { type: "check-result"; packId: string; checkId: string; title: string; verdict: string; reasoning: string; completed: number; total: number }
  | { type: "check-error"; packId: string; checkId: string; title: string; error: string; completed: number; total: number }
  | { type: "pack-done"; packId: string }
  | { type: "audit-done"; total: number }
  | { type: "error"; error: string };

function buildCheckPrompt(
  packTitle: string,
  packDesc: string,
  methodology: string,
  checkId: string,
  checkTitle: string,
  checkDesc: string,
  docData: Record<string, Record<string, string>>
): string {
  const docSummary = Object.entries(docData)
    .map(([docType, fields]) => {
      const entries = Object.entries(fields)
        .filter(([, v]) => v?.trim?.())
        .map(([k, v]) => `  - ${k}: ${v}`)
        .join("\n");
      return entries ? `[${docType}]\n${entries}` : `[${docType}] (no data)`;
    })
    .join("\n\n");
  return `You are a compliance auditor evaluating an individual check.\n\nPack: ${packTitle}\nDescription: ${packDesc}\nMethodology: ${methodology}\n\nCheck: ${checkId} — ${checkTitle}\nDescription: ${checkDesc}\n\nDocument data provided by the user:\n${docSummary || "(none provided)"}\n\nEvaluate this check against the pack's requirements and the document data provided.\nRespond with ONLY a JSON object (no markdown, no code fences):\n{"pass": true/false, "reasoning": "brief explanation of the verdict based on the evidence"}`;
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function* runPackAudit(
  sessionId: string,
  pack: PackAuditPack,
  docData: Record<string, Record<string, string>>
): AsyncGenerator<PackAuditEvent> {
  const items: { name: string; desc: string; status: string; statusLabel: string; checks: { name: string; pass: boolean }[] }[] =
    pack.checks.map((check) => ({
      name: `${check.id} — ${check.title}`,
      desc: check.desc,
      status: "run",
      statusLabel: "Running...",
      checks: [],
    }));

  setCompliancePackAuditResult(sessionId, pack.id, [...items]);
  yield { type: "pack-start", packId: pack.id, packTitle: pack.title };

  let totalCompleted = 0;

  for (let ci = 0; ci < pack.checks.length; ci++) {
    const check = pack.checks[ci]!;
    try {
      const prompt = buildCheckPrompt(pack.title, pack.desc, pack.methodology, check.id, check.title, check.desc, docData);
      const result = await generateText({
        model: createModel(),
        system: "You are a compliance auditor. Respond with ONLY a JSON object.",
        messages: [{ role: "user", content: prompt }],
        maxRetries: 1,
      });
      const text = result.text.trim();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      const { pass, reasoning } = jsonMatch
        ? JSON.parse(jsonMatch[0])
        : { pass: true, reasoning: "Defaulting to pass." };
      const verdict = pass ? "PASS" : "FAIL";

      items[ci] = {
        name: `${check.id} — ${check.title}`,
        desc: check.desc,
        status: "done",
        statusLabel: verdict,
        checks: [],
      };
      setCompliancePackAuditResult(sessionId, pack.id, [...items]);
      totalCompleted++;

      yield {
        type: "check-result",
        packId: pack.id,
        checkId: check.id,
        title: check.title,
        verdict,
        reasoning,
        completed: totalCompleted,
        total: totalCompleted,
      };

      const emoji = pass ? "✅" : "⚠️";
      addUserMessage(sessionId, `${emoji} **${pack.title}** → ${check.id}: **${verdict}** — ${reasoning}`);
    } catch (err) {
      items[ci] = {
        name: `${check.id} — ${check.title}`,
        desc: check.desc,
        status: "err",
        statusLabel: "Error",
        checks: [],
      };
      setCompliancePackAuditResult(sessionId, pack.id, [...items]);
      totalCompleted++;

      yield {
        type: "check-error",
        packId: pack.id,
        checkId: check.id,
        title: check.title,
        error: err instanceof Error ? err.message : "Unknown",
        completed: totalCompleted,
        total: totalCompleted,
      };
    }

    await delay(300 + Math.random() * 500);
  }

  yield { type: "pack-done", packId: pack.id };
}
