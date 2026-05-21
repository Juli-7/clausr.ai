import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
} from "docx";
import type { AgentResponse } from "@/lib/agent/types";

export async function generateDocx(
  response: AgentResponse,
  skillName?: string
): Promise<Blob> {
  if (skillName) {
    try {
      const blob = await fillTemplateDocx(response, skillName);
      if (blob) return blob;
    } catch (err) {
      console.error("[export-docx] Template fill failed, falling back:", err);
    }
  }
  return buildFallbackDocx(response, skillName);
}

async function fillTemplateDocx(
  response: AgentResponse,
  skillName: string
): Promise<Blob | null> {
  const JSZip = (await import("jszip")).default;

  const res = await fetch(`/api/skills/${encodeURIComponent(skillName)}/template`);
  if (!res.ok) return null;

  const zip = await JSZip.loadAsync(await res.arrayBuffer());
  const docEntry = zip.file("word/document.xml");
  if (!docEntry) return null;

  let docXml = await docEntry.async("text");
  docXml = normalizeConsecutiveRuns(docXml);

  const replacements = buildPlaceholderMap(response);
  for (const [placeholder, value] of Object.entries(replacements)) {
    const escaped = escapeXml(value);
    docXml = docXml.replaceAll(placeholder, escaped);
  }

  zip.file("word/document.xml", docXml);
  const outBlob = await zip.generateAsync({ type: "blob" });
  return outBlob;
}

/**
 * Build {placeholder} → value map from response.sections.
 *
 * Primary: keys match response.sections directly:
 *   "{summary}"          → sections.summary
 *   "{mounting_height}"  → sections.findings.mounting_height
 *
 * Also emits dot-path keys for compatibility:
 *   "{findings.mounting_height}" → same value
 */
function buildPlaceholderMap(
  response: AgentResponse
): Record<string, string> {
  const map: Record<string, string> = {};
  const sections = response.sections;
  if (!sections) return map;

  for (const [sectionId, value] of Object.entries(sections)) {
    if (typeof value === "string") {
      map[`{${sectionId}}`] = stripMarkdown(value);
    } else if (typeof value === "object" && value !== null) {
      map[`{${sectionId}}`] = stripMarkdown(Object.values(value).join(" "));
      for (const [key, val] of Object.entries(value)) {
        map[`{${key}}`] = stripMarkdown(String(val));
        map[`{${sectionId}.${key}}`] = stripMarkdown(String(val));
      }
    }
  }

  if (response.verdict) {
    map["{verdict}"] = response.verdict;
  }

  return map;
}

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

function buildFallbackDocx(
  response: AgentResponse,
  skillName?: string
): Promise<Blob> {
  const children: (Paragraph)[] = [];

  children.push(
    new Paragraph({
      text: skillName ? `${skillName} Compliance Report` : "Compliance Report",
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    })
  );

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
    title: skillName ? `${skillName} Compliance Report` : "Compliance Report",
    description: "Generated by clausr.ai",
    styles: { default: { document: { run: { font: "Calibri", size: 22 } } } },
    sections: [{ children }],
  });

  return Packer.toBlob(doc);
}
