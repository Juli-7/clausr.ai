/**
 * Template system for compliance report .docx export.
 *
 * Templates define how the response fields are mapped to {placeholder} markers
 * in the user's .docx layout file (stored at skills/{name}/assets/template.docx).
 * The UI document panel has a fixed layout (not template-driven).
 * Only the .docx export uses templates.
 */

export interface ReportTemplate {
  name: string;
  sections: TemplateSection[];
}

export type SectionType = "fields" | "markdown" | "table" | "verdict";

export interface TemplateSection {
  id: string;
  title: string;
  type: SectionType;
  fields?: TemplateField[];   // for type: "fields"
  columns?: string[];         // for type: "table"
}

export interface TemplateField {
  id: string;
  label: string;
  type: "text" | "number" | "select";
  options?: string[];         // for type: "select"
}
