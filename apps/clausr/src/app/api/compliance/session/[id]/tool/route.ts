import { NextRequest, NextResponse } from "next/server";
import { getComplianceSession, buildSession } from "@clausr/engine";
import { AuthError } from "@clausr/platform-core";
import { requireSessionAccess } from "@/lib/session-auth";
import { getTool } from "@/lib/compliance/tools/tool-registry";
import { logger } from "@/lib/logger";
import fs from "fs";
import path from "path";

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

  const body = await req.json().catch(() => null);
  if (!body || typeof body.name !== "string") {
    return NextResponse.json({ error: "Tool name required" }, { status: 400 });
  }

  const tool = getTool(body.name);
  if (!tool) {
    return NextResponse.json({ error: `Unknown tool: ${body.name}` }, { status: 400 });
  }

  const session = getComplianceSession(id);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  // Normalize legacy { value: "string" } objects to plain strings for batch_update_doc_fields
  const input: Record<string, unknown> = body.input ?? {};
  if (body.name === "batch_update_doc_fields") {
    const fields = input.fields;
    if (fields && typeof fields === "object" && !Array.isArray(fields)) {
      for (const [key, val] of Object.entries(fields)) {
        const fv = val;
        if (fv && typeof fv === "object" && "value" in fv) {
          (fields as Record<string, unknown>)[key] = (fv as { value: unknown }).value;
        }
      }
    }
  }

  // Validate input against schema
  let parsedInput: Record<string, unknown>;
  if (tool.inputSchema) {
    const result = tool.inputSchema.safeParse(input);
    if (!result.success) {
      return NextResponse.json({ error: "Invalid input", details: result.error.issues }, { status: 400 });
    }
    parsedInput = result.data as Record<string, unknown>;
  } else {
    parsedInput = input;
  }

  try {
    const result = await tool.execute(id, parsedInput);

    // Write uploaded file to disk so /api/files/ can serve it
    if (body.name === "attach_file" && typeof parsedInput.dataUrl === "string") {
      try {
        const uploadsDir = path.join(process.cwd(), "data", "uploads", id);
        fs.mkdirSync(uploadsDir, { recursive: true });
        const b64 = parsedInput.dataUrl.split(",")[1] ?? parsedInput.dataUrl;
        const buffer = Buffer.from(b64, "base64");
        fs.writeFileSync(path.join(uploadsDir, parsedInput.name as string), buffer);
      } catch (err) {
          logger.warn("[tool] file write failed (non-fatal)", { sessionId: id, fileName: parsedInput.name, error: (err as Error).message });
        }
    }

    // Flatten DocFieldValue wrappers in the result for backward compat
    if (result && typeof result.docData === "object" && result.docData !== null) {
      const flatDocData: Record<string, string> = {};
      for (const [field, val] of Object.entries(result.docData as Record<string, unknown>)) {
        flatDocData[field] = typeof val === "object" && val !== null
          ? String((val as { value?: string }).value ?? "")
          : String(val);
      }
      result.docData = flatDocData;
    }
    // Build fresh session and flatten for the UI — single response, no second fetch needed
    const fresh = buildSession(id);
    const docData: Record<string, string> = {};
    if (fresh) {
      for (const [field, val] of Object.entries(fresh.docData)) {
        docData[field] = typeof val === "object" && val !== null
          ? String((val as { value?: string }).value ?? "")
          : String(val);
      }
    }
    const uploadedFiles = (fresh?.uploadedFiles ?? []).map((f) => ({
      name: f.name,
      size: f.size,
      time: f.time,
      docType: f.docType,
      downloadUrl: `/api/files/${id}/${encodeURIComponent(f.name)}`,
    }));
    return NextResponse.json({ ...result, session: { ...fresh, docData, uploadedFiles } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Tool execution failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
