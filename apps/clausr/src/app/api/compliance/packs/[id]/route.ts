import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { requireAuth, requireRole, AuthError } from "@clausr/platform-core";
import type { AuthenticatedUser } from "@clausr/platform-core";
import { loadPack, bumpVersion, archivePackVersion } from "@clausr/engine";
import { logger } from "@/lib/logger";

const PACKS_DIR = process.env.PACKS_DIR ?? path.join(process.cwd(), "packs");

const MARKETPLACE_PACK_IDS = new Set<string>([
  "datasec-gb44464",
  "datasec-gdpr",
  "eu-md-doc",
  "eu-mdr",
  "eu-atex",
  "eu-emc",
  "eu-lvd",
  "eu-rohs",
  "eu-weee",
  "eu-ecodesign",
  "eu-ppwr",
  "eu-md-manual",
  "infosec-iso27001",
]);

function getDefaultVisibility(packId: string): "author" | "org" | "marketplace" {
  return MARKETPLACE_PACK_IDS.has(packId) ? "marketplace" : "author";
}

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

function canReadPack(user: AuthenticatedUser, packId: string, visibility: string, author: string, visibleToOrgIds?: string[]): boolean {
  if (user.platformRole === "superadmin") return true;
  if (author === user.email) return true;
  if (visibility === "marketplace") return true;
  if (visibility === "org") {
    if (visibleToOrgIds && visibleToOrgIds.length > 0) {
      return user.memberships.some((m) => visibleToOrgIds!.includes(m.organizationId));
    }
    return false;
  }
  return false;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let user;
  try {
    user = await requireAuth(req);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const { id } = await params;
  const pack = loadPack(id);
  if (!pack) return NextResponse.json({ error: "Pack not found" }, { status: 404 });
  let author = "";
  let checkPreview: "compact" | "full" = "full";
  let expert: Record<string, unknown> | undefined;
  let visibility: "author" | "org" | "marketplace" = "author";
  let visibleToOrgIds: string[] = [];
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(PACKS_DIR, id, "pack.json"), "utf-8"));
    author = raw?.pack?.author ?? "";
    checkPreview = raw?.pack?.checkPreview ?? "full";
    expert = raw?.pack?.expert;
    visibility = raw?.pack?.visibility ?? getDefaultVisibility(id);
    visibleToOrgIds = raw?.pack?.visibleToOrgIds ?? [];
  } catch (err) {
    logger.warn("[packs] failed to read author/checkPreview", { id, error: (err as Error).message });
  }

  if (!canReadPack(user, id, visibility, author, visibleToOrgIds)) {
    return NextResponse.json({ error: "Pack not found" }, { status: 404 });
  }

  return NextResponse.json({ ...pack, author, checkPreview, expert, visibility, visibleToOrgIds });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let user;
  try {
    user = await requireRole("superadmin", "expert")(req);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const { id } = await params;
  if (!canMutatePack(user, id)) {
    return NextResponse.json({ error: "Not authorized to edit this pack" }, { status: 403 });
  }

  const packDir = path.join(PACKS_DIR, id);
  if (!fs.existsSync(packDir)) {
    return NextResponse.json({ error: "Pack not found" }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch (err) {
    logger.warn("[packs] invalid JSON in PUT body", { id, error: (err as Error).message });
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const packPath = path.join(packDir, "pack.json");
  let existing: Record<string, unknown> = {};
  try {
    existing = JSON.parse(fs.readFileSync(packPath, "utf-8"));
  } catch (err) {
    logger.warn("[packs] failed to read existing pack.json for merge", { id, error: (err as Error).message });
  }

  const merged: Record<string, unknown> = { ...existing };

  // Archive the current version before overwriting (keeps immutable history)
  archivePackVersion(id);

  // Version bump: patch by default, or major/minor from body
  const bump = (body.bump as "major" | "minor" | "patch" | undefined) ?? "patch";
  if (!["major", "minor", "patch"].includes(bump)) {
    return NextResponse.json({ error: "Invalid bump value" }, { status: 400 });
  }
  const currentVersion = ((existing?.pack as Record<string, unknown> | undefined)?.version as string | undefined) ?? "1.0.0";
  const newVersion = bumpVersion(currentVersion, bump);

  // Shallow merge pack metadata
  if (body.pack && typeof body.pack === "object") {
    merged.pack = { ...(merged.pack as Record<string, unknown> ?? {}), ...(body.pack as Record<string, unknown>) };
  } else {
    const packMeta: Record<string, unknown> = { ...((merged.pack as Record<string, unknown>) ?? {}) };
    if (body.title) packMeta.title = body.title;
    if (body.description) packMeta.description = body.description;
    if (body.icon) packMeta.icon = body.icon;
    if (body.checkPreview) packMeta.checkPreview = body.checkPreview;
    if (body.expert && typeof body.expert === "object") packMeta.expert = body.expert;
    // Handle visibility change
    if (body.visibility) {
      const vis = body.visibility as string;
      if (!["author", "org", "marketplace"].includes(vis)) {
        return NextResponse.json({ error: "Invalid visibility value" }, { status: 400 });
      }
      // Expert can only set "org" visibility if they have an expert org membership
      if (vis === "org" && user.platformRole !== "superadmin") {
        const expertOrgIds = user.memberships.filter((m) => m.role === "expert").map((m) => m.organizationId);
        if (expertOrgIds.length === 0) {
          return NextResponse.json({ error: "You must be an expert in an organization to set org visibility" }, { status: 403 });
        }
      }
      // Only superadmin can set marketplace visibility
      if (vis === "marketplace" && user.platformRole !== "superadmin") {
        return NextResponse.json({ error: "Only superadmin can publish to marketplace" }, { status: 403 });
      }
      packMeta.visibility = vis;
    }
    // Handle visibleToOrgIds
    if (body.visibleToOrgIds !== undefined) {
      const ids = body.visibleToOrgIds as string[];
      if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string")) {
        return NextResponse.json({ error: "visibleToOrgIds must be an array of strings" }, { status: 400 });
      }
      packMeta.visibleToOrgIds = ids;
    }
    merged.pack = packMeta;
  }

  // Apply version bump + publish metadata
  const packMeta = merged.pack as Record<string, unknown> ?? {};
  packMeta.version = newVersion;
  if (body.status !== undefined) {
    if (body.status !== "draft" && body.status !== "published") {
      return NextResponse.json({ error: "Invalid status value" }, { status: 400 });
    }
    packMeta.status = body.status;
  } else {
    packMeta.status = packMeta.status ?? "published";
  }
  packMeta.updatedAt = new Date().toISOString();

  // Replace arrays when provided (don't shallow-merge)
  for (const key of ["fields", "documents", "checks", "redlines", "lessons"] as const) {
    if (key in body) merged[key] = body[key];
  }

  fs.writeFileSync(packPath, JSON.stringify(merged, null, 2), "utf-8");

  // Keep SKILL.md in sync when redlines/lessons/checks change
  const p = merged.pack as Record<string, unknown> ?? {};
  const title = typeof p.title === "string" ? p.title : (p.title as Record<string, string>)?.en ?? id;
  const checks = (merged.checks ?? []) as Record<string, unknown>[];
  const redlines = (merged.redlines ?? []) as string[];
  const lessons = (merged.lessons ?? []) as string[];
  const mdSections: string[] = [];
  if (checks.length || redlines.length || lessons.length) {
    if (checks.length) {
      mdSections.push("## Checks\n\n" + checks.map((c) => `### ${c.field}\n1. **type**: ${c.type}\n2. **description**: ${c.description}`).join("\n\n"));
    }
    if (redlines.length) {
      mdSections.push("## Red Lines\n\n" + redlines.map((r) => `- ❌ ${r}`).join("\n"));
    }
    if (lessons.length) {
      mdSections.push("## Lessons Learnt\n\n" + lessons.map((l) => `- ${l}`).join("\n"));
    }
  } else {
    mdSections.push(`# ${title}\n\nCompliance pack: ${p.description ?? ""}`);
  }
  fs.writeFileSync(path.join(packDir, "SKILL.md"), mdSections.join("\n\n"), "utf-8");

  const updated = loadPack(id);
  return NextResponse.json(updated ?? { id });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let user;
  try {
    user = await requireRole("superadmin", "expert")(req);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const { id } = await params;
  if (!canMutatePack(user, id)) {
    return NextResponse.json({ error: "Not authorized to delete this pack" }, { status: 403 });
  }

  const packDir = path.join(PACKS_DIR, id);
  if (!fs.existsSync(packDir)) {
    return NextResponse.json({ error: "Pack not found" }, { status: 404 });
  }

  fs.rmSync(packDir, { recursive: true, force: true });
  return NextResponse.json({ deleted: id });
}
