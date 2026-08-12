import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
} from "docx";
import type { AgentResponse } from "../../shared/types";
interface DocxCustomProperty { readonly name: string; readonly value: string; }

// Maps underscored check field names to hyphenated template placeholder names.
// A single check can map to multiple template placeholders.
const FIELD_ALIASES: Record<string, string[]> = {
  light_source: ["light-source"],
  mounting_height: ["mounting-height"],
  colour_temperature: ["colour-temp"],
  luminous_flux: ["luminous-flux"],
  beam_cutoff_angle: ["beam-pattern", "cutoff-sharpness"],
  auto_leveling: ["levelling-deviation"],
};

// Default fallback values for template placeholders that have no corresponding
// response data field (e.g. certifier info, vehicle metadata).
const DEFAULT_PLACEHOLDER_FALLBACKS: Record<string, string> = {
  "{vehicle-make-model}": "N/A",
  "{certifier-name}": "N/A",
  "{certification-date}": new Date().toISOString().split("T")[0]!,
  "{generationDate}": new Date().toISOString().split("T")[0]!,
};

export async function generateDocx(
  response: AgentResponse,
  templateInput?: string | Buffer
): Promise<Blob> {
  if (templateInput instanceof Buffer) {
    try {
      const blob = await fillTemplateFromBuffer(response, templateInput);
      if (blob) return blob;
    } catch (err) {
      console.error("[export-docx] Buffer template fill failed, falling back:", err);
    }
    return buildFallbackDocx(response);
  }
  if (typeof templateInput === "string") {
    try {
      const blob = await fillTemplateDocx(response, templateInput);
      if (blob) return blob;
    } catch (err) {
      console.error("[export-docx] Template fill failed, falling back:", err);
    }
    return buildFallbackDocx(response, templateInput);
  }
  return buildFallbackDocx(response);
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

  // Add explicit AI labeling (显式标识) + invisible watermark paragraph
  const insertBefore = '</w:body>';
  docXml = docXml.replace(insertBefore, buildLabelOoxml(response) + buildWatermarkOoxml(response) + insertBefore);

  zip.file("word/document.xml", docXml);

  // Inject / update custom properties with GB 45438-2025 附录E metadata
  injectCustomProperties(zip, response, JSZip);

  const outBlob = await zip.generateAsync({ type: "blob" });
  return outBlob;
}

  // Explicit AI labeling (显式标识) — GB 45438-2025 §5.1
  function buildLabelOoxml(response: AgentResponse): string {
    const label = `本内容由人工智能生成合成。本内容由 clausr.ai 基于 DeepSeek 模型生成，请谨慎辨别内容真实性。`;
    return `<w:p><w:r><w:rPr><w:sz w:val="18"/><w:color w:val="595959"/></w:rPr><w:t xml:space="preserve">${escapeXml(label)}</w:t></w:r></w:p>`;
  }

function buildWatermarkOoxml(response: AgentResponse): string {
  const provider = response.sections?.providerIdentity
    ? stripMarkdown(response.sections.providerIdentity as string)
    : "clausr.ai";
  const contentId = `${response.sessionId ?? "unknown"}-${Date.now()}`;
  const wm = `AIGen|${provider}|${contentId}|${new Date().toISOString().slice(0, 10)}`;
  return `<w:p><w:r><w:rPr><w:sz w:val="2"/><w:color w:val="FFFFFF"/><w:vanish/></w:rPr><w:t xml:space="preserve">${escapeXml(wm)}</w:t></w:r></w:p>`;
}

// ── GB 45438-2025 §6.1 / 附录E: single "AIGC" custom property with JSON value ──
// 附录E-a: field NAME contains "AIGC" (the property name is the carrier).
// Detectors (TC260 practice guides, aigc-metadata SDK) read property "AIGC"
// and JSON.parse() its value expecting the 7 keys at TOP LEVEL:
// {"Label":"1","ContentProducer":"...","ProduceID":"...","ReservedCode1":"",
//  "ContentPropagator":"...","PropagateID":"...","ReservedCode2":""}
// Do NOT wrap in {"AIGC": {...}} — top-level keys then resolve to nothing.
// Values are written RAW (no XML entity escaping of quotes): only & and < are
// escaped in XML text nodes, and JSON values never contain them unescaped.
const APPENDIX_E_FMTID = "{D5CDD505-2E9C-101B-9397-08002B2CF9AE}";

// 附录E-j: values consist of GB18030 codepoints 0x21, 0x23~0x5B, 0x5D~0x7E (" and \ excluded)
function cleanAppendixEValue(s: string): string {
  return s.replace(/[\\"]/g, "").replace(/[^\x21\x23-\x5B\x5D-\x7E]/g, "?").slice(0, 127);
}

function buildAppendixEMetadata(response: AgentResponse): DocxCustomProperty[] {
  const provider = cleanAppendixEValue(
    response.sections?.providerIdentity ? stripMarkdown(response.sections.providerIdentity as string) : "clausr.ai"
  );
  const contentId = `${response.sessionId ?? "unknown"}-${Date.now()}`;
  const json = JSON.stringify({
    Label: "1",
    ContentProducer: provider,
    ProduceID: cleanAppendixEValue(contentId),
    ReservedCode1: "",
    ContentPropagator: provider,
    PropagateID: cleanAppendixEValue(`${response.sessionId ?? "unknown"}-p-${Date.now()}`),
    ReservedCode2: "",
  });
  return [{ name: "AIGC", value: json }];
}

async function injectCustomProperties(zip: import("jszip"), response: AgentResponse, JSZip: typeof import("jszip")): Promise<void> {
  const json = buildAppendixEMetadata(response)[0]!.value;

  const propsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <property fmtid="${APPENDIX_E_FMTID}" pid="2" name="AIGC"><vt:lpwstr>${json.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</vt:lpwstr></property>
</Properties>`;

  zip.file("docProps/custom.xml", propsXml);

  // Ensure [Content_Types].xml includes custom.xml
  const ctEntry = zip.file("[Content_Types].xml");
  if (ctEntry) {
    let ctXml = await ctEntry.async("text");
    if (!ctXml.includes('docProps/custom.xml')) {
      ctXml = ctXml.replace('</Types>', `  <Override PartName="/docProps/custom.xml" ContentType="application/vnd.openxmlformats-officedocument.custom-properties+xml"/>\n</Types>`);
      zip.file("[Content_Types].xml", ctXml);
    }
  }

  // Ensure _rels/.rels includes the custom-properties relationship
  // (without this, OOXML readers cannot locate the metadata part)
  const relEntry = zip.file("_rels/.rels");
  if (relEntry) {
    let relXml = await relEntry.async("text");
    if (!relXml.includes('custom-properties')) {
      const existingIds = Array.from(relXml.matchAll(/Id="rId(\d+)"/g)).map((m) => parseInt(m[1]!, 10));
      const nextId = (existingIds.length > 0 ? Math.max(...existingIds) : 0) + 1;
      relXml = relXml.replace(
        '</Relationships>',
        `  <Relationship Id="rId${nextId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/custom-properties" Target="docProps/custom.xml"/>\n</Relationships>`
      );
      zip.file("_rels/.rels", relXml);
    }
  }
}

async function fillTemplateFromBuffer(
  response: AgentResponse,
  buffer: Buffer
): Promise<Blob | null> {
  const JSZip = (await import("jszip")).default;

  const zip = await JSZip.loadAsync(buffer);
  const docEntry = zip.file("word/document.xml");
  if (!docEntry) return null;

  let docXml = await docEntry.async("text");
  docXml = normalizeConsecutiveRuns(docXml);

  const replacements = buildPlaceholderMap(response);
  for (const [placeholder, value] of Object.entries(replacements)) {
    const escaped = escapeXml(value);
    docXml = docXml.replaceAll(placeholder, escaped);
  }

  // Explicit label + watermark (invisible paragraph)
  const insertBefore = '</w:body>';
  docXml = docXml.replace(insertBefore, buildLabelOoxml(response) + buildWatermarkOoxml(response) + insertBefore);

  zip.file("word/document.xml", docXml);

  // Inject custom properties with GB 45438-2025 附录E metadata
  await injectCustomProperties(zip, response, JSZip);

  const outBlob = await zip.generateAsync({ type: "blob" });
  return outBlob;
}

/**
 * Build {placeholder} → value map from response.sections.
 *
 * For each field found in response.sections, emits:
 *   - The raw underscored key:  "{mounting_height}"
 *   - The dot-path key:         "{findings.mounting_height}"
 *   - Any hyphenated aliases:   "{mounting-height}"  (via FIELD_ALIASES)
 *
 * Placeholders that still have no value after iteration receive their
 * DEFAULT_PLACEHOLDER_FALLBACKS (e.g. "{certifier-name}" → "N/A").
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
        const stripped = stripMarkdown(String(val));
        map[`{${key}}`] = stripped;
        map[`{${sectionId}.${key}}`] = stripped;
        const aliases = FIELD_ALIASES[key];
        if (aliases) {
          for (const alias of aliases) {
            map[`{${alias}}`] = stripped;
          }
        }
      }
    }
  }

  if (response.verdict) {
    map["{verdict}"] = response.verdict;
  }

  for (const [placeholder, fallback] of Object.entries(DEFAULT_PLACEHOLDER_FALLBACKS)) {
    if (!(placeholder in map)) {
      map[placeholder] = fallback;
    }
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

// ── GB 45438-2025 §6.2: invisible watermark paragraph ──
function buildWatermarkParagraph(response: AgentResponse): Paragraph {
  const provider = response.sections?.providerIdentity
    ? stripMarkdown(response.sections.providerIdentity as string)
    : "clausr.ai";
  const contentId = `${response.sessionId ?? "unknown"}-${Date.now()}`;
  const watermarkText = `AIGen|${provider}|${contentId}|${new Date().toISOString().slice(0, 10)}`;
  return new Paragraph({
    spacing: { before: 0, after: 0, line: 1 },
    children: [
      new TextRun({
        text: watermarkText,
        size: 1,
        color: "FFFFFF",
        font: "Calibri",
        specVanish: true,
      }),
    ],
  });
}

function humanizeSlug(slug: string): string {
  return slug
    .replace(/[-_.]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

async function buildFallbackDocx(
  response: AgentResponse,
  skillName?: string
): Promise<Blob> {
  const children: (Paragraph | Table)[] = [];

  // ── Title ──
  children.push(
    new Paragraph({
      text: skillName ? `${skillName} Compliance Report` : "Compliance Report",
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    })
  );

  // ── Explicit AI labeling (GB 45438-2025 §5.1) ──
  children.push(
    new Paragraph({
      spacing: { before: 200, after: 200 },
      children: [
        new TextRun({
          text: "本内容由人工智能生成合成。本内容由 clausr.ai 基于 DeepSeek 模型生成，请谨慎辨别内容真实性。",
          size: 18,
          color: "595959",
          italics: true,
        }),
      ],
    })
  );

  // ── Meta line ──
  const metaParts = [
    new TextRun({ text: "Date: ", bold: true, size: 20 }),
    new TextRun({ text: `${new Date().toISOString().slice(0, 10)}`, size: 20 }),
    new TextRun({ text: "     ", size: 20 }),
    new TextRun({ text: "Ref: ", bold: true, size: 20 }),
    new TextRun({ text: `${(response.sessionId ?? "unknown").slice(-8)}`, size: 20 }),
  ];
  children.push(new Paragraph({ spacing: { after: 100 }, children: metaParts }));

  // ── Executive Summary ──
  children.push(new Paragraph({ text: "", spacing: { before: 300 } }));
  children.push(
    new Paragraph({
      text: "Executive Summary",
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 200, after: 200 },
    })
  );

  const verdict = response.verdict === "PASS" ? "PASS" : "FAIL";
  const verdictColor = response.verdict === "PASS" ? "2ea043" : "f85149";
  children.push(
    new Paragraph({
      spacing: { after: 200 },
      children: [
        new TextRun({ text: "Overall Verdict: ", bold: true, size: 24 }),
        new TextRun({ text: verdict, color: verdictColor, bold: true, size: 24 }),
      ],
    })
  );

  // ── Findings table ──
  const checkResults = response.checkResults as Array<Record<string, unknown>> | undefined;
  if (checkResults && checkResults.length > 0) {
    const passed = checkResults.filter((c) => c.verdict === "PASS").length;
    const failed = checkResults.filter((c) => c.verdict === "FAIL").length;
    const total = passed + failed;
    const pending = checkResults.filter((c) => c.verdict === "PENDING").length;

    const headerBg = "F0F0F0";
    const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };

    const tableRows: TableRow[] = [
      new TableRow({
        tableHeader: true,
        children: [
          new TableCell({
            width: { size: 7000, type: WidthType.DXA },
            shading: { fill: headerBg },
            children: [new Paragraph({ text: "Finding", spacing: { after: 0 }, children: [new TextRun({ text: "Finding", bold: true, size: 20 })] })],
          }),
          new TableCell({
            width: { size: 2000, type: WidthType.DXA },
            shading: { fill: headerBg },
            children: [new Paragraph({ text: "Verdict", spacing: { after: 0 }, children: [new TextRun({ text: "Verdict", bold: true, size: 20 })] })],
          }),
        ],
      }),
    ];

    for (const cr of checkResults) {
      const v = cr.verdict as string;
      const pass = v === "PASS";
      const vColor = pass ? "2ea043" : "f85149";
      tableRows.push(
        new TableRow({
          children: [
            new TableCell({
              width: { size: 7000, type: WidthType.DXA },
              children: [new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: humanizeSlug(cr.name as string), size: 20 })] })],
            }),
            new TableCell({
              width: { size: 2000, type: WidthType.DXA },
              children: [new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: pass ? `PASS` : `FAIL`, color: vColor, bold: true, size: 20 })] })],
            }),
          ],
        })
      );
    }

    children.push(
      new Table({
        rows: tableRows,
        width: { size: 9000, type: WidthType.DXA },
      })
    );

    const passRate = total > 0 ? Math.round((passed / total) * 100) : 0;
    children.push(
      new Paragraph({
        spacing: { before: 200, after: 300 },
        children: [
          new TextRun({ text: `Pass Rate: `, bold: true, size: 20 }),
          new TextRun({ text: `${passed}/${total} (${passRate}%)`, size: 20 }),
          ...(pending > 0
            ? [new TextRun({ text: `     Pending: ${pending}`, size: 20, italics: true, color: "888888" })]
            : []),
        ],
      })
    );
  }

  // ── Detailed Findings ──
  const divider = "─".repeat(60);
  children.push(new Paragraph({ text: divider, spacing: { before: 200, after: 100 }, alignment: AlignmentType.CENTER }));
  children.push(
    new Paragraph({
      text: "Detailed Findings",
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 100, after: 200 },
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
    if (trimmed.startsWith("### ")) {
      children.push(
        new Paragraph({
          text: trimmed.replace(/^###\s+/, ""),
          heading: HeadingLevel.HEADING_3,
          spacing: { before: 200 },
        })
      );
    } else if (trimmed.startsWith("## ")) {
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

  // ── Style override: make heading 3 lines in detail bold ──
  // (handled via the docx library styles)

  // ── Watermark (GB 45438-2025 §6.2) ──
  children.push(buildWatermarkParagraph(response));

  // ── References ──
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
            new TextRun({ text: `[${c.ref}] `, bold: true, size: 20 }),
            new TextRun({ text: `${c.regulation} §${c.clause}`, size: 20 }),
          ],
        })
      );
    }
  }

  // ── Footer ──
  children.push(new Paragraph({ text: "", spacing: { before: 400 } }));
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
      border: { top: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC", space: 8 } },
      children: [
        new TextRun({ text: "Generated by ", size: 22, color: "999999", italics: true }),
        new TextRun({ text: "clausr.ai", size: 22, color: "6366f1", italics: true, bold: true }),
      ],
    })
  );

  const doc = new Document({
    title: skillName ? `${skillName} Compliance Report` : "Compliance Report",
    description: "Generated by clausr.ai",
    creator: "clausr.ai",
    styles: { default: { document: { run: { font: "Calibri", size: 22 } } } },
    sections: [{ children }],
  });

  // docx lib escapes custom-property values (&quot;), which breaks the 附录E
  // JSON format detectors expect — post-process the packed zip with the same
  // raw-JSON injection used on the template path.
  const packed = await Packer.toBuffer(doc);
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(packed);
  await injectCustomProperties(zip, response, JSZip);
  const out = await zip.generateAsync({ type: "nodebuffer" });
  return new Blob([out], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
}
