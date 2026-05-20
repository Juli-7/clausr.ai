import type { ParsedStep } from "@/lib/agent/skill/step-parser";

export class ReportAssembler {
  private sections: Record<string, Record<string, string> | string> | null = null;
  private verdict: "PASS" | "FAIL" | null = null;

  setContent(sections: Record<string, Record<string, string> | string>): void {
    this.sections = sections;
  }

  getContent(): string {
    if (!this.sections) return "Assessment not available.";

    const parts: string[] = [];
    for (const [sectionId, value] of Object.entries(this.sections)) {
      if (typeof value === "string") {
        parts.push(`## ${sectionId}\n${value}`);
      } else if (typeof value === "object" && value !== null) {
        const tableRows = Object.entries(value)
          .map(([k, v]) => `| ${k} | ${v} |`)
          .join("\n");
        parts.push(`## ${sectionId}\n| Field | Value |\n| --- | --- |\n${tableRows}`);
      }
    }
    return parts.join("\n\n");
  }

  getAllContentFlat(): string {
    if (!this.sections) return "";
    return Object.values(this.sections)
      .map((s) => (typeof s === "string" ? s : Object.values(s).join(" ")))
      .join(" ");
  }

  getSections(): Record<string, Record<string, string> | string> | null {
    return this.sections;
  }

  getSection(id: string): Record<string, string> | string | null | undefined {
    if (!this.sections) return null;
    return this.sections[id];
  }

  setVerdict(v: "PASS" | "FAIL"): void {
    this.verdict = v;
  }

  getVerdict(): "PASS" | "FAIL" | null {
    return this.verdict;
  }
}
