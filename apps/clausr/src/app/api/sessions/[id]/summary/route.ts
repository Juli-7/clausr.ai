import { NextRequest, NextResponse } from "next/server";
import { getPack } from "@clausr/engine";
import type { SkillPack } from "@clausr/engine";
import { AuthError } from "@clausr/platform-core";
import { requireSessionAccess } from "@/lib/session-auth";
import { logger } from "@/lib/logger";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { session: meta } = await requireSessionAccess(req, id, "read");
    if (!meta) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const sd = meta.summaryData;
    let compliance: {
      step: number;
      selectedPacks: { id: string; title: string }[];
      uploadedFileCount: number;
      docCompleteness: { packId: string; filled: number; total: number }[];
      auditPerPack: { packId: string; passed: number; failed: number; total: number }[];
      auditDone: boolean;
    } | null = null;

    if (sd) {
      compliance = {
        step: sd.step,
        selectedPacks: sd.selectedPackIds.map((pid) => {
          const pack = getPack(pid) as SkillPack | null;
          const title = pack
            ? (typeof pack.title === "string" ? pack.title : pack.title.en ?? pid)
            : pid;
          return { id: pid, title };
        }),
        uploadedFileCount: sd.uploadedFileCount,
        docCompleteness: sd.docCompleteness ?? [],
        auditPerPack: sd.auditPerPack ?? [],
        auditDone: sd.auditDone ?? false,
      };
    }

    return NextResponse.json({
      sessionId: id,
      skillName: meta.skillName,
      name: meta.name,
      createdAt: meta.createdAt,
      compliance,
    }, { status: 200 });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : "Internal server error";
    logger.error("[api/sessions/[id]/summary]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
