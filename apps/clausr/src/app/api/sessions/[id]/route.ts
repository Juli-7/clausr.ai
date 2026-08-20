import { NextRequest, NextResponse } from "next/server";
import {
  getConversationHistory,
  getResponsesForSession,
  getSessionFiles,
  getComplianceSession,
  getPack,
  deleteSession as deleteEngineSession,
} from "@clausr/engine";
import type { SkillPack } from "@clausr/engine";
import { getSession, updateSessionName, deleteSession as deletePlatformSession, AuthError } from "@clausr/platform-core";
import { requireSessionAccess } from "@/lib/session-auth";
import { logger } from "@/lib/logger";
import { cleanupSessionFiles } from "@/lib/cleanup";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    requireSessionAccess(req, id, "read");
    const messages = getConversationHistory(id);
    const responses = getResponsesForSession(id);
    const meta = getSession(id);
    const rawFiles = getSessionFiles(id);
    const sessionFiles = JSON.parse(rawFiles);
    const complianceData = getComplianceSession(id);

    if (messages.length === 0 && !complianceData) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    let compliance: {
      step: number;
      selectedPacks: { id: string; title: string }[];
      packFields: { packId: string; fields: { id: string; label: string; type: string; required: boolean }[] }[];
      docData: Record<string, string>;
      docTemplates: { type: string; title: string; fields: string[] }[];
      auditResults: unknown[];
      auditRunning: boolean;
      auditDone: boolean;
    } | null = null;

    if (complianceData) {
      // Flatten DocFieldValue wrappers to plain strings
      const docData: Record<string, string> = {};
      for (const [field, val] of Object.entries(complianceData.docData)) {
        docData[field] = typeof val === "object" && val !== null
          ? String((val as { value?: string }).value ?? "")
          : String(val);
      }

      // Collect pack fields and document templates
      const packFields: { packId: string; fields: { id: string; label: string; type: string; required: boolean }[] }[] = [];
      const templateMap = new Map<string, { type: string; title: string; fields: string[] }>();
      for (const pid of complianceData.selectedPackIds) {
        const pack = getPack(pid) as SkillPack | null;
        if (pack) {
          const packTitle = typeof pack.title === "string" ? pack.title : pack.title.en ?? pid;
          packFields.push({
            packId: pid,
            fields: pack.fields.map((f) => ({
              id: f.id,
              label: typeof f.label === "string" ? f.label : f.label.en ?? f.id,
              type: f.type ?? "text",
              required: f.required ?? false,
            })),
          });
          for (const doc of pack.documents) {
            if (!templateMap.has(doc.type)) {
              templateMap.set(doc.type, {
                type: doc.type,
                title: typeof doc.title === "string" ? doc.title : doc.title.en ?? doc.type,
                fields: doc.fields as string[],
              });
            }
          }
        }
      }

      compliance = {
        step: complianceData.step,
        selectedPacks: complianceData.selectedPackIds.map((pid) => {
          const pack = getPack(pid);
          const title = pack ? (typeof pack.title === "string" ? pack.title : pack.title.en ?? pid) : pid;
          return { id: pid, title };
        }),
        packFields,
        docData,
        docTemplates: Array.from(templateMap.values()),
        auditResults: complianceData.auditResults,
        auditRunning: complianceData.auditRunning,
        auditDone: complianceData.auditDone,
      };
    }

    return NextResponse.json({
      sessionId: id,
      skillName: meta?.skillName ?? "",
      sessionFiles,
      messages,
      responses,
      compliance,
    }, { status: 200 });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : "Internal server error";
    logger.error("[api/sessions/[id]]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    requireSessionAccess(req, id, "write");
    const body = await req.json();
    if (body.name) updateSessionName(id, body.name);
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : "Internal server error";
    logger.error("[api/sessions/[id] PATCH]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    requireSessionAccess(req, id, "write");
    deletePlatformSession(id);
    deleteEngineSession(id);
    cleanupSessionFiles(id);
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : "Internal server error";
    logger.error("[api/sessions/[id] DELETE]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
