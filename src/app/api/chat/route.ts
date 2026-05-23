import { NextRequest, NextResponse } from "next/server";
import { ChatRequestSchema } from "@/lib/agent/shared/schemas";
import { hasSessionSetup } from "@/lib/agent/shared/memory/repository";
import { orchestratePipeline } from "@/lib/agent/pipeline/orchestrator-v2";
import fs from "fs";
import path from "path";

const LOG_FILE = path.join(process.cwd(), "data", "debug.log");
function dbg(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  process.stderr.write(line);
  try { fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true }); } catch {}
  try { fs.appendFileSync(LOG_FILE, line); } catch {}
}

export async function POST(req: NextRequest) {
  dbg("=== POST /api/chat HIT ===");
  try {
    const body = await req.json().catch((e) => {
      dbg("FAILED to parse request body: " + String(e));
      return null;
    });
    if (!body) {
      return NextResponse.json({ error: "Request body is required" }, { status: 400 });
    }

    const parsed = ChatRequestSchema.safeParse(body);
    if (!parsed.success) {
      dbg("VALIDATION FAILED: " + JSON.stringify(parsed.error.flatten().fieldErrors));
      return NextResponse.json(
        { error: "Invalid request body", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { message, sessionId, revisionFields } = parsed.data;

    // Verify the session has been set up (POST /api/setup must be called first)
    if (!hasSessionSetup(sessionId)) {
      dbg("NO SETUP for session: " + sessionId);
      return NextResponse.json(
        { error: "Session has not been set up. Call POST /api/setup first." },
        { status: 400 }
      );
    }

    dbg(`sessionId: ${sessionId} | message: ${message.slice(0, 80)} | revisionFields: ${revisionFields ? revisionFields.join(",") : "none"}`);

    // ── SSE streaming response ──
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        const send = (data: unknown) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        };

        try {
          for await (const event of orchestratePipeline(sessionId, message, revisionFields)) {
            send(event);
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Stream error";
          send({ type: "error", error: msg });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("[api/chat]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
