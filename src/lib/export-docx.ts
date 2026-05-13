import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
} from "docx";
import type { AgentResponse } from "@/lib/agent/types";
import type { ReportTemplate } from "@/lib/agent/template-types";

/**
 * Generate a .docx Blob from an AgentResponse.
 *
 * Primary path: fetch the skill's original template .docx and fill {placeholders}
 * with values from response.sections. This preserves the user's layout and formatting.
 *
 * Fallback: build a simple .docx from response.content using the docx library
 * (when no template is available or sections data is missing).
 */
export async function generateDocx(
  response: AgentResponse,
  template?: ReportTemplate | null,
  skillName?: string
): Promise<Blob> {
  // ── Primary path: fill placeholders in the original template .docx ──
  if (template && skillName && response.sections) {
    try {
      const blob = await fillTemplateDocx(response, template, skillName);
      if (blob) return blob;
    } catch (err) {
      console.error("[export-docx] Template fill failed, falling back:", err);
    }
  }

  // ── Fallback: build a simple .docx from markdown content ──
  return buildFallbackDocx(response, template);
}

/**
 * Fetch the original template .docx, fill {placeholders} in the XML, re-zip.
 */
async function fillTemplateDocx(
  response: AgentResponse,
  template: ReportTemplate,
  skillName: string
): Promise<Blob | null> {
  const JSZip = (await import("jszip")).default;

  // Fetch original template .docx
  const res = await fetch(`/api/skills/${encodeURIComponent(skillName)}/template`);
  if (!res.ok) return null;

  const zip = await JSZip.loadAsync(await res.arrayBuffer());
  const docEntry = zip.file("word/document.xml");
  if (!docEntry) return null;

  let docXml = await docEntry.async("text");

  // Normalize consecutive runs to reunite split placeholders
  docXml = normalizeConsecutiveRuns(docXml);

  // Build a flat map of all placeholders to their replacement values
  const replacements = buildPlaceholderMap(response, template);

  // Apply replacements
  for (const [placeholder, value] of Object.entries(replacements)) {
    const escaped = escapeXml(value);
    // Replace all occurrences (placeholders may appear multiple times)
    docXml = docXml.replaceAll(placeholder, escaped);
  }

  // Update the zip
  zip.file("word/document.xml", docXml);

  // Re-zip and return
  const outBlob = await zip.generateAsync({ type: "blob" });
  return outBlob;
}

/**
 * Build a flat map from {placeholder-name} → value, scanning all template sections.
 */
function buildPlaceholderMap(
  response: AgentResponse,
  template: ReportTemplate
): Record<string, string> {
  const map: Record<string, string> = {};

  for (const section of template.sections) {
    const sectionData = response.sections?.[section.id];

    if (section.type === "fields" && section.fields && typeof sectionData === "object" && sectionData) {
      for (const field of section.fields) {
        const val = (sectionData as Record<string, string>)[field.id];
        if (val !== undefined) {
          map[`{${field.id}}`] = val;
        }
      }
    }

    if (section.type === "markdown" && typeof sectionData === "string") {
      map[`{${section.id}}`] = stripMarkdown(sectionData);
    }

    if (section.type === "table" && typeof sectionData === "string") {
      map[`{${section.id}}`] = stripMarkdown(sectionData);
    }

    if (section.type === "verdict") {
      map[`{verdict}`] = response.verdict === "PASS" ? "PASS" : "FAIL";
    }
  }

  return map;
}

/**
 * Merge consecutive <w:r> XML runs where the second only has optional formatting.
 * This reunites placeholders that Word splits across runs:
 *   <w:r><w:t>{vehi-</w:t></w:r><w:r><w:t>cle-make}</w:t></w:r>
 *   → <w:r><w:t>{vehicle-make}</w:t></w:r>
 */
function normalizeConsecutiveRuns(xml: string): string {
  const runBoundary =
    /<\/w:t>\s*<\/w:r>\s*<w:r\b[^>]*>\s*(?:<w:rPr>[^<]*(?:<(?:\/|[^\/])[^>]*>)*<\/w:rPr>\s*)?<w:t[^>]*>/gs;
  return xml.replace(runBoundary, "");
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function stripMarkdown(md: string): string {
  return md
    .replace(/[#*_~`\[\]()>|]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ── Fallback: build a .docx from scratch ──

function buildFallbackDocx(
  response: AgentResponse,
  template?: ReportTemplate | null
): Promise<Blob> {
  const children: (Paragraph)[] = [];

  // Title
  children.push(
    new Paragraph({
      text: template?.name ?? "Compliance Report",
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    })
  );

  // Metadata
  children.push(
    new Paragraph({
      spacing: { after: 400 },
      children: [
        new TextRun({ text: `Verdict: `, bold: true }),
        new TextRun({
          text: response.verdict === "PASS" ? "PASS" : "FAIL",
          color: response.verdict === "PASS" ? "2ea043" : "f85149",
          bold: true,
        }),
        new TextRun({
          text: `     Round: ${response.round ?? "?"}     Session: ${(response.sessionId ?? "unknown").slice(-8)}`,
          italics: true,
        }),
      ],
    })
  );

  // Content lines
  const content = response.content || "Assessment not available.";
  const lines = content.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      children.push(new Paragraph({ spacing: { after: 100 } }));
      continue;
    }
    if (trimmed.startsWith("## ")) {
      children.push(
        new Paragraph({
          text: trimmed.replace(/^##\s+/, ""),
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 200 },
        })
      );
    } else if (trimmed.startsWith("# ")) {
      children.push(
        new Paragraph({
          text: trimmed.replace(/^#\s+/, ""),
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 200 },
        })
      );
    } else {
      children.push(new Paragraph({ text: trimmed, spacing: { after: 100 } }));
    }
  }

  // Citations
  if (response.citations.length > 0) {
    children.push(new Paragraph({ text: "", spacing: { before: 400 } }));
    children.push(
      new Paragraph({
        text: "References",
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 200, after: 100 },
      })
    );
    for (const c of response.citations) {
      children.push(
        new Paragraph({
          spacing: { after: 60 },
          children: [
            new TextRun({ text: `[${c.ref}] `, bold: true }),
            new TextRun({ text: `${c.regulation} §${c.clause}` }),
          ],
        })
      );
    }
  }

  const doc = new Document({
    title: template?.name ?? "Compliance Report",
    description: "Generated by clausr.ai",
    styles: { default: { document: { run: { font: "Calibri", size: 22 } } } },
    sections: [{ children }],
  });

  return Packer.toBlob(doc);
}
