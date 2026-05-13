import { NextRequest, NextResponse } from "next/server";
import { ChatRequestSchema } from "@/lib/agent/schemas";
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
    // ── Validate request body ──
    const body = await req.json().catch((e) => {
      dbg("FAILED to parse request body: " + String(e));
      return null;
    });
    if (!body) {
      return NextResponse.json({ error: "Request body is required" }, { status: 400 });
    }
    dbg("Body keys: " + Object.keys(body).join(", ") + " | files present: " + String((body as Record<string,unknown>).files != null));

    const parsed = ChatRequestSchema.safeParse(body);
    if (!parsed.success) {
      dbg("VALIDATION FAILED: " + JSON.stringify(parsed.error.flatten().fieldErrors));
      return NextResponse.json(
        { error: "Invalid request body", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    dbg("Validation PASSED");

    const { message, skillName, sessionId, files } = parsed.data;
    dbg("skillName: " + String(skillName) + " | message: " + message.slice(0, 80) + " | files: " + (files ? files.map(f => f.name + " (" + f.type + ", dataUrl:" + (f.dataUrl ? f.dataUrl.slice(0, 30) + "..." : "MISSING") + ")" ).join("; ") : "none"));
    const useTemplate = body.useTemplate !== false; // default true

    // ── SSE streaming response ──
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        const send = (data: unknown) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        };

        try {
          for await (const event of orchestratePipeline(message, skillName, sessionId, useTemplate, files)) {
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
