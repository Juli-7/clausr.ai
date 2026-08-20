import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOrgAdmin, getOrgConfig, updateOrgConfig } from "@clausr/platform-core";

const PricingEntrySchema = z.object({
  input: z.number().min(0),
  output: z.number().min(0),
});

const ConfigSchema = z.object({
  llmModel: z.string().optional(),
  llmProvider: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(1).optional(),
  usageLimit: z.number().min(0).optional(),
  usageLimitPeriod: z.enum(["monthly", "total"]).optional(),
  tokenPrice: z.number().min(0).optional(),
  expertLimit: z.number().int().min(0).optional(),
  pricing: z.record(z.string(), PricingEntrySchema).optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireOrgAdmin(req);
    const { id } = await params;
    const config = getOrgConfig(id);
    return NextResponse.json(config, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const caller = await requireOrgAdmin(req);
    const { id } = await params;

    if (caller.platformRole !== "superadmin") {
      const isAdmin = caller.memberships.some(
        (m) => m.organizationId === id && m.role === "admin",
      );
      if (!isAdmin) {
        return NextResponse.json({ error: "Not authorized for this org" }, { status: 403 });
      }
    }

    const body = await req.json();
    const parsed = ConfigSchema.parse(body);
    updateOrgConfig(id, parsed);

    const { logAuditEvent } = await import("@clausr/platform-core");
    logAuditEvent({
      tenantId: id,
      userId: caller.id,
      userEmail: caller.email,
      action: "org.config.update",
      resourceType: "organization",
      resourceId: id,
      metadata: { config: parsed },
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
