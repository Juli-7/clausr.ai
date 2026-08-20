import { NextRequest, NextResponse } from "next/server";
import { generateDocx } from "@clausr/engine";
import type { AgentResponse, SkillPack } from "@clausr/engine";
import { AuthError } from "@clausr/platform-core";
import { requireSessionAccess } from "@/lib/session-auth";
import { buildSession } from "@/lib/compliance/session-builder";
import { getPack } from "@/lib/compliance/seed";
import { logger } from "@/lib/logger";
import fs from "fs/promises";
import path from "path";

function toTitle(k: string): string {
  return k
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}

function getTemplate(session: { selectedPackIds: string[] }, docType: string) {
  for (const pid of session.selectedPackIds) {
    const pack = getPack(pid) as SkillPack | null;
    if (!pack) continue;
    const tpl = pack.documents.find((d) => d.type === docType);
    if (tpl) return { pack, tpl };
  }
  return null;
}

function getFieldLabel(fieldId: string, packs: SkillPack[]): string {
  for (const p of packs) {
    const f = p.fields.find((f) => f.id === fieldId);
    if (f) return typeof f.label === "string" ? f.label : (f.label.en ?? fieldId);
  }
  return toTitle(fieldId.replace(/-/g, " "));
}

async function loadTemplateBuffer(packId: string, docType: string): Promise<Buffer | null> {
  const packDir = path.join(process.cwd(), "packs", packId);

  const candidates = [
    // Engine writePack stores in assets/{docType}.docx
    path.join(packDir, "assets", `${docType}.docx`),
    // Per-document template at root (legacy)
    path.join(packDir, `${docType}.docx`),
    // Legacy per-pack template.docx
    path.join(packDir, "template.docx"),
  ];

  for (const candidate of candidates) {
    try {
      return await fs.readFile(candidate);
    } catch { /* try next candidate */ }
  }
  return null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; docType: string }> }) {
  const { id, docType } = await params;
  try {
    await requireSessionAccess(req, id, "read");
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const session = buildSession(id);
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  const selectedPacks = session.selectedPackIds
    .map((pid: string) => getPack(pid) as SkillPack | null)
    .filter(Boolean) as SkillPack[];

  const docData: Record<string, string> = {};
  for (const [field, val] of Object.entries(session.docData)) {
    docData[field] = typeof val === "object" && val !== null ? String((val as { value?: string }).value ?? "") : String(val);
  }
  const matched = getTemplate(session, docType);
  const tpl = matched?.tpl ?? null;
  const owningPack = matched?.pack ?? null;
  const label = tpl?.title ? (typeof tpl.title === "string" ? tpl.title : tpl.title.en ?? docType) : toTitle(docType.replace(/-/g, " "));

  // Build content string from form fields
  let content = `# ${label}\n\n`;
  if (tpl) {
    for (const fieldId of tpl.fields) {
      const val = docData[fieldId] || "";
      const fieldLabel = getFieldLabel(fieldId as string, selectedPacks);
      content += `## ${fieldLabel}\n`;
      content += val ? `${val}\n\n` : "(not provided)\n\n";
    }
  } else {
    for (const [k, v] of Object.entries(docData)) {
      content += `## ${toTitle(k)}\n${v as string}\n\n`;
    }
  }

  // Build sections for template placeholder replacement
  const sections: Record<string, string> = {};
  if (tpl) {
    for (const fieldId of tpl.fields) {
      sections[fieldId as string] = docData[fieldId as string] || "";
    }
  }

  // For test-plan: inject per-check adapted procedures + all docData fields + result summaries
  if (docType === "test-plan" && owningPack) {
    // Inject all filled questionnaire fields so the template can use basic info placeholders
    for (const [k, v] of Object.entries(docData)) {
      if (!(k in sections)) sections[k] = v;
    }

    const testPlans = session.testPlans ?? [];
    for (const check of owningPack.checks) {
      if (!check.testProcedure) continue;
      const plan = testPlans.find((p) => p.checkId === check.id);
      const defaultProc = check.testProcedure;
      const standard = plan?.standardProcedure || defaultProc || "";
      const adapted = plan?.adaptedProcedure || defaultProc || "(not yet adapted)";
      const result = plan?.resultSummary || "";
      const status = plan?.status || "pending";
      const key = check.field || check.id;
      sections[key] = adapted;
      sections[`${key}_standard`] = standard;
      sections[`${key}_result`] = result;
      sections[`${key}_status`] = status;

      const checkTitle = typeof check.description === "string" ? check.description : check.id;
      content += `## ${checkTitle} (${check.id})\n\n`;
      content += `**Status:** ${status}\n\n`;
      if (standard) {
        let purpose = "";
        try { const p = JSON.parse(standard); purpose = p.purpose || ""; } catch {}
        if (purpose) content += `**Test Purpose:** ${purpose}\n\n`;
      }
      content += `**Adapted Procedure:**\n${adapted}\n\n`;
      if (result) content += `**Result:** ${result}\n\n`;
    }
  }

  // Load per-document template .docx for styled export
  const templateBuffer = owningPack ? await loadTemplateBuffer(owningPack.id, docType) : null;

  const response = {
    content,
    reasoning: `Generated document: ${label}`,
    citations: [],
    round: 0,
    sessionId: id,
    sections,
  } as AgentResponse;

  const blob = await generateDocx(response, templateBuffer ?? undefined);
  const buf = Buffer.from(await blob.arrayBuffer());
  const filename = `${docType}-${id.slice(0, 8)}.docx`;

  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
