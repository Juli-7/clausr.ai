import { NextRequest, NextResponse } from "next/server";
import { AuthError } from "@clausr/platform-core";
import { requireSessionAccess } from "@/lib/session-auth";
import path from "path";
import fs from "fs";
import { logger } from "@/lib/logger";

const OVERRIDES_DIR = path.join(process.cwd(), "data", "audit-overrides");

function ensureDir() {
  if (!fs.existsSync(OVERRIDES_DIR)) {
    fs.mkdirSync(OVERRIDES_DIR, { recursive: true });
  }
}

function getOverridesPath(sessionId: string) {
  return path.join(OVERRIDES_DIR, `${sessionId}.json`);
}

function readOverrides(sessionId: string): Record<string, Record<string, unknown>> {
  ensureDir();
  const filePath = getOverridesPath(sessionId);
  if (!fs.existsSync(filePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch (err) {
    logger.warn("[audit-override] failed to parse overrides file", { sessionId, error: (err as Error).message });
    return {};
  }
}

function writeOverrides(sessionId: string, data: Record<string, Record<string, unknown>>) {
  ensureDir();
  fs.writeFileSync(getOverridesPath(sessionId), JSON.stringify(data, null, 2), "utf-8");
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await requireSessionAccess(req, id, "read");
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const overrides = readOverrides(id);
  return NextResponse.json({ overrides });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let userEmail = "unknown";
  try {
    const result = await requireSessionAccess(req, id, "write");
    userEmail = result.user.email ?? "unknown";
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const body = await req.json().catch(() => null);
  if (!body || !body.checkId) {
    return NextResponse.json({ error: "checkId is required" }, { status: 400 });
  }

  const override = {
    checkId: body.checkId,
    originalVerdict: body.originalVerdict ?? "",
    newVerdict: body.newVerdict ?? "",
    originalReasoning: body.originalReasoning ?? "",
    newReasoning: body.newReasoning ?? "",
    changedBy: userEmail,
    changedAt: Date.now(),
    reason: body.reason ?? "",
  };

  const overrides = readOverrides(id);
  overrides[body.checkId] = override;
  writeOverrides(id, overrides);

  return NextResponse.json({ success: true, override });
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

  const checkId = req.nextUrl.searchParams.get("checkId");
  if (!checkId) {
    return NextResponse.json({ error: "checkId query param is required" }, { status: 400 });
  }

  const overrides = readOverrides(id);
  if (!overrides[checkId]) {
    return NextResponse.json({ error: "Override not found" }, { status: 404 });
  }

  delete overrides[checkId];
  writeOverrides(id, overrides);

  return NextResponse.json({ success: true });
}
