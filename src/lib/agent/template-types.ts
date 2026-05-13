/**
 * Template system for compliance report layout.
 *
 * Templates define how the LLM's output is structured into a document.
 * Each skill has exactly one template (in skills/{name}/assets/template.json).
 * Q&A sessions use a built-in default markdown card layout.
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
