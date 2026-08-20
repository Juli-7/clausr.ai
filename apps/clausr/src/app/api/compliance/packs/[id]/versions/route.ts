import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@clausr/platform-core";
import { listPackVersions } from "@clausr/engine";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth(req);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const { id } = await params;
  const versions = listPackVersions(id);
  return NextResponse.json({ versions });
}
