import { NextRequest, NextResponse } from "next/server";
import { generateDocx, getClauseText } from "@clausr/engine";
import type { AgentResponse } from "@clausr/engine";
import { AuthError } from "@clausr/platform-core";
import { requireSessionAccess } from "@/lib/session-auth";
import { buildSession } from "@/lib/compliance/session-builder";
import { getPack } from "@/lib/compliance/seed";

function humanize(k: string): string {
  return k
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}

function stripMd(md: string): string {
  return md.replace(/[#*_~`\[\]()>|]/g, "").replace(/\n{3,}/g, "\n\n").trim();
}

interface CheckSourceCitation {
  ref: string;
  filename?: string;
  keyExcerpt?: string;
  extractedText?: string;
  pageNumber?: number;
  pageCount?: number;
}

async function buildReportContent(
  session: { selectedPackIds: string[]; agentResponses: Record<string, string> }
): Promise<{
  content: string;
  sections: Record<string, string | Record<string, string>>;
  citations: { ref: string; regulation: string; clause: string }[];
  verdict: string;
}> {
  const mdParts: string[] = [];
  const sections: Record<string, string | Record<string, string>> = {};
  const allCitations: { ref: string; regulation: string; clause: string }[] = [];
  let anyFail = false;
  let anyDone = false;

  for (const packId of session.selectedPackIds) {
    const raw = session.agentResponses?.[packId];
    if (!raw) continue;
    let ar: AgentResponse;
    try { ar = JSON.parse(raw); } catch { continue; }

    const pack = getPack(packId);
    const packTitle = pack && typeof pack.title === "string" ? pack.title : (typeof pack?.title === "object" ? pack.title.en ?? packId : packId);

    mdParts.push(`## ${packTitle}`);
    mdParts.push("");

    // Verdict badge
    if (ar.verdict) {
      mdParts.push(`**Overall:** ${ar.verdict === "PASS" ? "✓ PASS" : "✗ FAIL"}`);
      mdParts.push("");
      if (ar.verdict === "FAIL") anyFail = true;
      anyDone = true;
    }

    // Per-check details from checkResults
    const checkResults = ar.checkResults;
    if (checkResults && checkResults.length > 0) {
      for (const cr of checkResults) {
        const passed = cr.verdict === "PASS";
        const icon = passed ? "✓" : "✗";
        mdParts.push(`### ${icon} ${humanize(cr.name)}`);
        mdParts.push(`**Verdict:** ${cr.verdict}`);
        mdParts.push("");

        if (cr.finding) {
          mdParts.push(cr.finding);
          mdParts.push("");
        }

        // Source citations — handle both string refs and pre-resolved objects
        const sourceCitations: CheckSourceCitation[] = [];
        const crAny = cr as Record<string, unknown>;

        if (Array.isArray(crAny.sourceCitation) && ar.sourceCitations) {
          for (const ref of crAny.sourceCitation) {
            const sc = ar.sourceCitations.find((s) => s.ref === ref);
            if (sc) {
              sourceCitations.push({
                ref: sc.ref,
                filename: sc.filename,
                keyExcerpt: sc.keyExcerpt,
                extractedText: sc.extractedText,
                pageNumber: sc.pageNumber,
                pageCount: sc.pageCount,
              });
            } else {
              sourceCitations.push({ ref });
            }
          }
        } else if (Array.isArray(crAny.sourceCitations)) {
          for (const sc of crAny.sourceCitations as Record<string, unknown>[]) {
            sourceCitations.push({
              ref: String(sc.ref ?? ""),
              filename: sc.filename as string | undefined,
              keyExcerpt: sc.keyExcerpt as string | undefined,
              extractedText: sc.extractedText as string | undefined,
              pageNumber: sc.pageNumber as number | undefined,
              pageCount: sc.pageCount as number | undefined,
            });
          }
        }

        if (sourceCitations.length > 0) {
          mdParts.push("**Source References:**");
          for (const sc of sourceCitations) {
            const cited = sc.extractedText ?? sc.keyExcerpt ?? "";
            mdParts.push(`- ${sc.filename ?? "source"}: "${stripMd(cited.slice(0, 500))}"`);
          }
          mdParts.push("");
        }

        // Regulation citations with clause text (fetched lazily at export time)
        const citationRef = crAny.citationRef as string[] | undefined;
        if (citationRef && citationRef.length > 0) {
          mdParts.push("**Regulation References:**");
          for (const ref of citationRef) {
            const dot = ref.indexOf(".");
            if (dot === -1) {
              mdParts.push(`- ${ref}`);
              continue;
            }
            const regulation = ref.substring(0, dot);
            const clause = ref.substring(dot + 1);
            allCitations.push({ ref, regulation, clause });
            try {
              const clauseData = await getClauseText(ref);
              const clauseText = clauseData?.text ?? "";
              mdParts.push(`- ${regulation} §${clause}${clauseText ? `: ${stripMd(clauseText)}` : ""}`);
            } catch {
              mdParts.push(`- ${regulation} §${clause}`);
            }
          }
          mdParts.push("");
        }
      }
    } else if (ar.content) {
      // Fallback: use raw content from agent response
      mdParts.push(ar.content);
      mdParts.push("");
    }

    // Pass through sections for template placeholder filling
    if (ar.sections) {
      for (const [k, v] of Object.entries(ar.sections)) {
        sections[k] = v;
      }
    }
  }

  // Summary
  mdParts.push("---");
  mdParts.push("");
  const overall = anyFail ? "FAIL" : anyDone ? "PASS" : "PENDING";
  mdParts.push(`**Overall Result:** ${overall}`);
  mdParts.push(`**Packs Audited:** ${session.selectedPackIds.length}`);

  return {
    content: mdParts.join("\n"),
    sections,
    citations: allCitations,
    verdict: overall,
  };
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
  const session = buildSession(id);
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  const { content, sections, citations, verdict } = await buildReportContent(session);

  const response = {
    content,
    reasoning: "Aggregated compliance audit report across all selected packs.",
    citations,
    round: 0,
    sessionId: id,
    verdict,
    sections,
  } as AgentResponse;

  const blob = await generateDocx(response);
  const buf = Buffer.from(await blob.arrayBuffer());
  const filename = `compliance-report-${id.slice(0, 8)}.docx`;

  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
