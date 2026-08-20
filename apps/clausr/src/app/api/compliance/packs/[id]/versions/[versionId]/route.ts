import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { requireAuth, requireRole, AuthError } from "@clausr/platform-core";
import type { AuthenticatedUser } from "@clausr/platform-core";
import { restorePackVersion } from "@clausr/engine";
import { logger } from "@/lib/logger";

const PACKS_DIR = process.env.PACKS_DIR ?? path.join(process.cwd(), "packs");

function canMutatePack(user: AuthenticatedUser, packId: string): boolean {
  if (user.platformRole === "superadmin") return true;
  const packPath = path.join(PACKS_DIR, packId, "pack.json");
  try {
    const raw = JSON.parse(fs.readFileSync(packPath, "utf-8"));
    return raw?.pack?.author === user.email;
  } catch (err) {
    logger.warn("[packs] canMutatePack failed", { packId, error: (err as Error).message });
    return false;
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; versionId: string }> }) {
  let user;
  try {
    user = await requireRole("superadmin", "expert")(req);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const { id, versionId } = await params;
  if (!canMutatePack(user, id)) {
    return NextResponse.json({ error: "Not authorized to edit this pack" }, { status: 403 });
  }

  const result = restorePackVersion(id, versionId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? "Failed to restore version" }, { status: 404 });
  }

  return NextResponse.json({ restored: versionId, packId: id });
}
