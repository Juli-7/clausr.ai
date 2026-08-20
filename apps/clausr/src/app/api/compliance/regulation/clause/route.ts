import { NextRequest, NextResponse } from "next/server";
import { getRegulationApi } from "@clausr/engine";
import { logger } from "@/lib/logger";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const clause = req.nextUrl.searchParams.get("clause");
  if (!code || !clause) {
    return NextResponse.json({ error: "Missing code or clause" }, { status: 400 });
  }

  try {
    const api = await getRegulationApi();
    const result = await api.getClause({ regulationCode: code, clauseNumber: clause });
    if (!result.success || !result.data) {
      return NextResponse.json({ error: "Clause not found" }, { status: 404 });
    }
    return NextResponse.json({
      number: result.data.number,
      title: result.data.title,
      text: result.data.text,
    });
  } catch (err) {
    logger.warn("[regulation] getClause failed", { code, clause, error: (err as Error).message });
    return NextResponse.json({ error: "Regulation API not available" }, { status: 503 });
  }
}
