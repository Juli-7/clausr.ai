import { NextRequest } from "next/server";
import {
  complianceChat,
  buildComplianceStepPrompt, getPack, buildSession,
  getComplianceToolCalls, setComplianceToolCalls, addAssistantMessage,
} from "@clausr/engine";
import type { SkillPack, PackAuditItem } from "@clausr/engine";
import { getSession, AuthError, recordUsage, updateSessionName, getOrgConfig, getEventPrice, getClientIp, getOrgUsageCost } from "@clausr/platform-core";
import { requireSessionAccess } from "@/lib/session-auth";
import { saveSessionSummary } from "@/lib/compliance/session-builder";
import { checkRateLimit } from "@/lib/rate-limit";
import { ensureEngineInit } from "@/lib/server-init";
import { checkInput } from "@/lib/compliance/content-guard";

const MAX_REJECTIONS = 3;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let user;
  const { id } = await params;
  try {
    const result = await requireSessionAccess(req, id, "write");
    user = result.user;
  } catch (err) {
    if (err instanceof AuthError) {
      return new Response(JSON.stringify({ error: err.message }), { status: err.status });
    }
    throw err;
  }
  const tenantId = user.memberships[0]?.organizationId ?? "";

  const ip = getClientIp(req);
  const ipLimit = parseInt(process.env.CHAT_RATE_LIMIT_IP ?? "200", 10);
  const tenantLimit = parseInt(process.env.CHAT_RATE_LIMIT_TENANT ?? "2000", 10);
  const rl = checkRateLimit(`compliance-chat:${ip}`, ipLimit);
  const tenantRl = checkRateLimit(`compliance-chat:tenant:${tenantId}`, tenantLimit);
  if (!rl.allowed || !tenantRl.allowed) {
    return new Response(JSON.stringify({ error: "Too many requests" }), { status: 429 });
  }

  // Check usage limit before processing
  const orgConfig = getOrgConfig(tenantId);
  if (orgConfig.usageLimit != null) {
    const period = orgConfig.usageLimitPeriod ?? "total";
    const currentCost = getOrgUsageCost(tenantId, period);
    if (currentCost >= orgConfig.usageLimit) {
      return new Response(JSON.stringify({ error: "Usage limit reached. Please contact your administrator." }), { status: 402 });
    }
  }

  const session = buildSession(id);
  if (!session) {
    return new Response(JSON.stringify({ error: "Session not found" }), { status: 404 });
  }

  // RBAC: only superadmin/expert can use pack-creation tools
  const isExpert = user.platformRole === "superadmin" || user.memberships?.some((m: { role: string }) => m.role === "expert");

  const body = await req.json().catch(() => null);
  const message = body?.message?.trim();
  const lang = body?.lang === "zh" ? "zh" : "en";
  if (!message) {
    return new Response(JSON.stringify({ error: "Message is required" }), { status: 400 });
  }

  // ── 3-strike termination: count "⛔ Input rejected" from conversation history ──
  const prevRejections = session.messages.filter(
    (m) => m.role === "assistant" && m.content.includes("⛔ Input rejected")
  ).length;
  if (prevRejections >= MAX_REJECTIONS) {
    const enc = new TextEncoder();
    return new Response(new ReadableStream({
      start(c) {
        c.enqueue(enc.encode(`data: ${JSON.stringify({ type: "token", text: lang === "zh" ? "⛔ clausr.ai 检测到危险行为，会话已终止。" : "⛔ clausr.ai detected hazardous activity — session terminated." })}\n\n`));
        c.enqueue(enc.encode(`data: ${JSON.stringify({ type: "done", usage: { inputTokens: 0, outputTokens: 0 } })}\n\n`));
        c.close();
      },
    }), {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
    });
  }

  // ── Content guard: reject promptly + save as assistant message for strike tracking ──
  const guard = checkInput(message);
  if (!guard.allowed) {
    addAssistantMessage(id, "⛔ Input rejected");
    const enc = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(enc.encode(`data: ${JSON.stringify({ type: "token", text: "⛔ Input rejected" })}\n\n`));
        controller.enqueue(enc.encode(`data: ${JSON.stringify({ type: "done", usage: { inputTokens: 0, outputTokens: 0 } })}\n\n`));
        controller.close();
      },
    });
    return new Response(stream, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
    });
  }

  const step = session.step;

  // Ensure engine config is initialized (no-op after first call)
  ensureEngineInit();

  // ── Auto-name session from first user message ──
  const sessionMeta = getSession(id);
  if (sessionMeta && !sessionMeta.name && session.messages.length <= 1) {
    const title = message.length > 60 ? message.slice(0, 57) + "..." : message;
    updateSessionName(id, title);
  }

  // ── Build pack context for prompt enrichment ──
  const selectedPacks: SkillPack[] = session.selectedPackIds
    .map((pid: string) => getPack(pid))
    .filter((p): p is SkillPack => p != null);

  // Count filled fields for session state
  const allFields = selectedPacks.flatMap((p) =>
    (p.fields ?? []).filter((f) => f.required)
  );
  const totalRequiredFields = allFields.length;
  const filledFieldCount = allFields.filter((f) => {
    const val = session.docData[f.id];
    return val?.value?.trim();
  }).length;

  const sessionState = {
    step: session.step,
    selectedPackIds: session.selectedPackIds,
    filledFieldCount,
    totalRequiredFields,
    validationScore: session.validationScore,
    validationChecks: session.validationChecks,
    uploadedFileCount: session.uploadedFiles?.length,
    uploadedFiles: session.uploadedFiles?.map((f: { name: string; docType?: string }) => ({
      name: f.name,
      docType: f.docType,
    })),
    documentsFinalized: session.documentsFinalized,
    testPlans: session.testPlans,
    auditItems: session.auditResults?.map((r: { packId: string; items: PackAuditItem[] }) => ({
      packId: r.packId,
      items: r.items,
    })),
    packStates: session.packStates as Record<string, string> | undefined,
    auditDone: session.auditDone,
    auditRunning: session.auditRunning,
    precheckDone: session.precheckDone,
  };
  const chatParams: Parameters<typeof complianceChat>[1] = {
    messages: [
      ...session.messages.slice(-10).filter((m) => m.role === "user" || m.role === "assistant").map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      { role: "user" as const, content: message },
    ],
    step,
    packs: selectedPacks,
    sessionState,
    disallowedTools: [
      ...(!isExpert ? ["design_pack"] : []),
    ],
  };
  if (!isExpert) {
    const basePrompt = buildComplianceStepPrompt(step, selectedPacks, sessionState);
    chatParams.systemPrompt = basePrompt + `\n\n## Role Restrictions
IMPORTANT: The current user's account does NOT have permission to create packs. The \`create_pack\` tool is unavailable to this user — only expert/superadmin roles can create packs.

If the user asks to create a pack or mentions creating one, immediately inform them that their account doesn't have pack creation permissions, and suggest contacting an administrator or selecting from existing packs instead. Do NOT proceed to interview them about pack details.`;
  }
  const enc = new TextEncoder();
  const responseStream = new ReadableStream({
    async start(controller) {
      const send = (event: Record<string, unknown>) => {
        controller.enqueue(enc.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      const toolResults: { tool: string; result: unknown }[] = [];
      try {
        for await (const event of complianceChat(id, chatParams)) {
          if (event.type === "text-delta") {
            send({ type: "token", text: event.text });
          } else if (event.type === "tool-call") {
            send({ type: "tool-call", tool: event.toolName, args: event.args });
          } else if (event.type === "tool-result") {
            const regulationTools = ["search_clauses", "get_regulation_text"];
            const resultPayload: Record<string, unknown> = { type: "tool-result", tool: event.toolName };
            if (regulationTools.includes(event.toolName) && event.result) {
              resultPayload.result = event.result;
              toolResults.push({ tool: event.toolName, result: event.result });
            }
            send(resultPayload);
            if (event.toolName === "run_pending_checks") {
              const toolResult = event.result as Record<string, unknown> | undefined;
              const usage = toolResult?.usage as { promptTokens?: number; completionTokens?: number } | undefined;
              if (usage && typeof usage.promptTokens === "number") {
                const pt = usage.promptTokens;
                const ct = usage.completionTokens ?? 0;
                const totalTokens = pt + ct;
                const orgConfig = getOrgConfig(tenantId);
                const { input: inputPrice, output: outputPrice } = getEventPrice("compliance-audit", orgConfig);
                const cost = (pt / 1000) * inputPrice + (ct / 1000) * outputPrice;
                recordUsage({
                  tenantId, userId: user.id, sessionId: id,
                  eventType: "compliance-audit",
                  quantity: totalTokens,
                  unit: "tokens",
                  cost,
                  metadata: { promptTokens: pt, completionTokens: ct, toolName: event.toolName },
                });
              }
            }
          } else if (event.type === "done") {
            const inputTokens = event.usage.inputTokens ?? 0;
            const outputTokens = event.usage.outputTokens ?? 0;
            const totalTokens = inputTokens + outputTokens;
            const orgConfig = getOrgConfig(tenantId);
            const { input: inputPrice, output: outputPrice } = getEventPrice("compliance-chat", orgConfig);
            const cost = (inputTokens / 1000) * inputPrice + (outputTokens / 1000) * outputPrice;
            recordUsage({
              tenantId, userId: user.id, sessionId: id,
              eventType: "compliance-chat",
              quantity: totalTokens,
              unit: "tokens",
              cost,
              metadata: { inputTokens: event.usage.inputTokens, outputTokens: event.usage.outputTokens },
            });
          } else if (event.type === "error") {
            send({ type: "error", error: event.error });
          }
        }

        // ── Save summary snapshot to auth.db ──
        saveSessionSummary(id);

        // ── Persist regulation tool results for post-reload rendering ──
        if (toolResults.length > 0) {
          const existing = getComplianceToolCalls(id);
          setComplianceToolCalls(id, [...existing, ...toolResults]);
        }

        // ── Update session name from pack titles if packs selected ──
        const latest = buildSession(id);
        if (latest?.selectedPackIds.length) {
          const packNames = latest.selectedPackIds
            .map((pid: string) => getPack(pid)?.title)
            .filter(Boolean) as string[];
          const meta = getSession(id);
          if (packNames.length && !meta?.name) {
            const title = packNames.length <= 3
              ? packNames.join(" + ")
              : packNames.slice(0, 2).join(" + ") + ` +${packNames.length - 2}`;
            updateSessionName(id, title);
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown";
        console.error("chat stream error:", msg);
        send({ type: "error", error: msg });
      }
      controller.close();
    },
  });

  return new Response(responseStream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}
