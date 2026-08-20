import { NextRequest } from "next/server";
import { Resend } from "resend";

interface ComplaintEntry {
  id: string; name: string; email: string; message: string;
  type: "complaint" | "report" | "feedback";
  createdAt: string; ip: string;
}

const complaints: ComplaintEntry[] = [];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const name = (body.name ?? "").trim();
    const email = (body.email ?? "").trim();
    const message = (body.message ?? "").trim();
    const type = (body.type ?? "complaint") as ComplaintEntry["type"];

    if (!name || !email || !message) {
      return new Response(JSON.stringify({ error: "name, email, and message are required" }), { status: 400 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return new Response(JSON.stringify({ error: "Invalid email format" }), { status: 400 });
    }
    if (!["complaint", "report", "feedback"].includes(type)) {
      return new Response(JSON.stringify({ error: "Invalid type" }), { status: 400 });
    }

    const entry: ComplaintEntry = {
      id: `cmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name, email, message, type,
      createdAt: new Date().toISOString(),
      ip: req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "unknown",
    };
    complaints.push(entry);

    console.log(`[complaint] ${entry.id}: ${type} from ${email} — "${message.slice(0, 100)}"`);

    // Forward to admin via Resend if configured
    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    const ADMIN_EMAIL = process.env.COMPLAINT_EMAIL ?? process.env.RESEND_FROM_EMAIL ?? "tianjierong@inspectorai.cn";
    if (RESEND_API_KEY) {
      try {
        const resend = new Resend(RESEND_API_KEY);
        await resend.emails.send({
          from: ADMIN_EMAIL,
          to: [ADMIN_EMAIL],
          subject: `[${type.toUpperCase()}] ${name} — ${entry.id}`,
          text: `Type: ${type}\nFrom: ${name} (${email})\nDate: ${entry.createdAt}\nIP: ${entry.ip}\n\nMessage:\n${message}`,
        });
      } catch (e) {
        console.warn("[complaint] Email send failed:", e);
      }
    }

    return new Response(JSON.stringify({
      success: true, id: entry.id,
      message: "Complaint received. We will respond within 48 hours.",
    }), { status: 201 });
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request body" }), { status: 400 });
  }
}
