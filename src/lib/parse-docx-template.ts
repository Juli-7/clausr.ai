import mammoth from "mammoth";
import type { ReportTemplate } from "@/lib/agent/template-types";

/**
 * Parse a .docx file buffer and extract {placeholder-name} patterns
 * to build a ReportTemplate JSON.
 *
 * Approach: plain text extraction via mammoth → regex for {placeholders}
 * → each becomes a text field. The user prepares their .docx with
 * {field-name} markers; we keep the parsing side minimal.
 */
export async function parseDocxTemplate(
  dataUrl: string
): Promise<ReportTemplate> {
  const base64 = dataUrl.split(",")[1] ?? dataUrl;
  const buffer = Buffer.from(base64, "base64");

  const result = await mammoth.extractRawText({ buffer });
  const text = result.value || "";

  // Find all {placeholder} patterns, deduplicate, preserve order
  const placeholderRegex = /\{([a-z][a-z0-9_-]*)\}/gi;
  const seen = new Set<string>();
  const placeholders: string[] = [];

  let match: RegExpExecArray | null;
  while ((match = placeholderRegex.exec(text)) !== null) {
    const name = match[1].toLowerCase();
    if (!seen.has(name)) {
      seen.add(name);
      placeholders.push(name);
    }
  }

  const sections: ReportTemplate["sections"] = [];

  if (placeholders.length > 0) {
    sections.push({
      id: "fields",
      title: "Report Fields",
      type: "fields",
      fields: placeholders.map((name) => ({
        id: name,
        label: humanize(name),
        type: "text",
      })),
    });
  }

  sections.push(
    { id: "assessment", title: "Assessment", type: "markdown" },
    { id: "verdict", title: "Verdict", type: "verdict" }
  );

  return {
    name: "Imported Template",
    sections,
  };
}

/**
 * Convert "vehicle-make" or "vehicle_make" → "Vehicle Make"
 */
function humanize(slug: string): string {
  return slug
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
