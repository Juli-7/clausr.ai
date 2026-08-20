import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { AuthError } from "@clausr/platform-core";
import { requireSessionAccess } from "@/lib/session-auth";
import path from "path";
import fs from "fs";
import { logger } from "@/lib/logger";

const SHARE_DIR = path.join(process.cwd(), "data", "audit-share-links");

function ensureDir() {
  if (!fs.existsSync(SHARE_DIR)) {
    fs.mkdirSync(SHARE_DIR, { recursive: true });
  }
}

function getSharePath(sessionId: string) {
  return path.join(SHARE_DIR, `${sessionId}.json`);
}

function readShare(sessionId: string): { token: string; createdAt: string } | null {
  ensureDir();
  const filePath = getSharePath(sessionId);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch (err) {
    logger.warn("[share-link] failed to parse share file", { sessionId, error: (err as Error).message });
    return null;
  }
}

function writeShare(sessionId: string, token: string) {
  ensureDir();
  fs.writeFileSync(getSharePath(sessionId), JSON.stringify({ token, createdAt: new Date().toISOString() }, null, 2), "utf-8");
}

function deleteShare(sessionId: string) {
  ensureDir();
  const filePath = getSharePath(sessionId);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

export function getShareToken(sessionId: string): string | null {
  return readShare(sessionId)?.token ?? null;
}

export function resolveShareToken(token: string): { sessionId: string; createdAt: string } | null {
  ensureDir();
  const tokenFile = path.join(SHARE_DIR, `${token}.json`);
  if (fs.existsSync(tokenFile)) {
    try {
      return JSON.parse(fs.readFileSync(tokenFile, "utf-8"));
    } catch {
      return null;
    }
  }
  // Reverse lookup: scan files for matching token
  try {
    for (const f of fs.readdirSync(SHARE_DIR)) {
      if (!f.endsWith(".json")) continue;
      const data = readShare(f.replace(/\.json$/, ""));
      if (data?.token === token) {
        return { sessionId: f.replace(/\.json$/, ""), createdAt: data.createdAt };
      }
    }
  } catch {
    return null;
  }
  return null;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await requireSessionAccess(req, id, "write");
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const existing = readShare(id);
  if (existing) {
    return NextResponse.json({ token: existing.token, url: `/share/${existing.token}` });
  }

  const token = crypto.randomBytes(24).toString("hex");
  writeShare(id, token);
  // Token → session reverse lookup file
  const tokenFile = path.join(SHARE_DIR, `${token}.json`);
  fs.writeFileSync(tokenFile, JSON.stringify({ sessionId: id, createdAt: new Date().toISOString() }, null, 2), "utf-8");

  return NextResponse.json({ token, url: `/share/${token}` });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await requireSessionAccess(req, id, "write");
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const existing = readShare(id);
  if (existing) {
    const tokenFile = path.join(SHARE_DIR, `${existing.token}.json`);
    if (fs.existsSync(tokenFile)) fs.unlinkSync(tokenFile);
    deleteShare(id);
  }
  return NextResponse.json({ revoked: true });
}
