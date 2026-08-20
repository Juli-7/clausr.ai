import { NextRequest, NextResponse } from "next/server";
import { AuthError } from "@clausr/platform-core";
import { requireSessionAccess } from "@/lib/session-auth";
import { getClauseText } from "@clausr/engine";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await requireSessionAccess(req, id, "read");

    const ref = req.nextUrl.searchParams.get("ref");
    if (!ref) {
      return NextResponse.json({ error: "Missing ref query param" }, { status: 400 });
    }

    const clause = await getClauseText(ref);
    if (!clause) {
      return NextResponse.json({ error: "Clause not found" }, { status: 404 });
    }

    return NextResponse.json(clause);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
