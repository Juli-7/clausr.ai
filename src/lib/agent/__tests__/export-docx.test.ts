import { describe, it, expect } from "vitest";
import type { AgentResponse } from "@/lib/agent/types";
import type { ReportTemplate } from "@/lib/agent/template-types";

// Replicate the utility functions from export-docx.ts for testing
// (they are not exported individually, so we test them inline)

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

function normalizeConsecutiveRuns(xml: string): string {
  const runBoundary =
    /<\/w:t>\s*<\/w:r>\s*<w:r\b[^>]*>\s*(?:<w:rPr>[^<]*(?:<(?:\/|[^\/])[^>]*>)*<\/w:rPr>\s*)?<w:t[^>]*>/gs;
  return xml.replace(runBoundary, "");
}

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
      map["{verdict}"] = response.verdict === "PASS" ? "PASS" : "FAIL";
    }
  }

  return map;
}

// ── Tests ──

describe("escapeXml", () => {
  it("escapes ampersands", () => {
    expect(escapeXml("A & B")).toBe("A &amp; B");
  });

  it("escapes angle brackets", () => {
    expect(escapeXml("<tag>")).toBe("&lt;tag&gt;");
  });

  it("escapes double quotes", () => {
    expect(escapeXml('say "hello"')).toBe("say &quot;hello&quot;");
  });

  it("handles multiple special chars", () => {
    expect(escapeXml('a < b & c > "d"')).toBe("a &lt; b &amp; c &gt; &quot;d&quot;");
  });

  it("returns plain text unchanged", () => {
    expect(escapeXml("Plain text 123")).toBe("Plain text 123");
  });

  it("returns empty string unchanged", () => {
    expect(escapeXml("")).toBe("");
  });
});

describe("stripMarkdown", () => {
  it("removes header markers", () => {
    expect(stripMarkdown("## Heading")).toBe("Heading");
  });

  it("removes bold/italic markers", () => {
    expect(stripMarkdown("**bold** and *italic*")).toBe("bold and italic");
  });

  it("removes link syntax", () => {
    expect(stripMarkdown("[link](http://example.com)")).toBe("linkhttp://example.com");
  });

  it("removes inline code markers", () => {
    expect(stripMarkdown("Use `code` here")).toBe("Use code here");
  });

  it("removes table pipe characters", () => {
    expect(stripMarkdown("| Cell 1 | Cell 2 |")).toBe("Cell 1  Cell 2");
  });

  it("collapses 3+ newlines to 2", () => {
    expect(stripMarkdown("line1\n\n\n\nline2")).toBe("line1\n\nline2");
  });

  it("trims whitespace", () => {
    expect(stripMarkdown("  padded  ")).toBe("padded");
  });
});

describe("normalizeConsecutiveRuns", () => {
  it("merges consecutive w:r runs with optional w:rPr", () => {
    const xml = `<w:r><w:rPr><w:b/></w:rPr><w:t>{vehicle-</w:t></w:r><w:r><w:t>make}</w:t></w:r>`;
    const result = normalizeConsecutiveRuns(xml);
    expect(result).toBe(`<w:r><w:rPr><w:b/></w:rPr><w:t>{vehicle-make}</w:t></w:r>`);
  });

  it("merges runs without w:rPr", () => {
    const xml = `<w:r><w:t>{light-</w:t></w:r><w:r><w:t>source}</w:t></w:r>`;
    const result = normalizeConsecutiveRuns(xml);
    expect(result).toBe(`<w:r><w:t>{light-source}</w:t></w:r>`);
  });

  it("handles multiple consecutive splits", () => {
    const xml = `<w:r><w:t>{a-</w:t></w:r><w:r><w:rPr><w:i/></w:rPr><w:t>b-</w:t></w:r><w:r><w:t>c}</w:t></w:r>`;
    const result = normalizeConsecutiveRuns(xml);
    // After first merge: {a-b- and then {a-b-c}
    expect(result).not.toContain("}-</w:t>");
    expect(result.match(/\{/g)?.length).toBe(1);
    expect(result.match(/\}/g)?.length).toBe(1);
  });

  it("leaves non-consecutive runs unchanged", () => {
    const xml = `<w:r><w:t>Hello</w:t></w:r><w:p/>\n<w:r><w:t>World</w:t></w:r>`;
    const result = normalizeConsecutiveRuns(xml);
    expect(result).toBe(xml); // no merge because there's <w:p/> between
  });
});

describe("buildPlaceholderMap", () => {
  const baseResponse: AgentResponse = {
    content: "Test",
    reasoning: "",
    citations: [],
    round: 1,
    sessionId: "test",
    verdict: "PASS",
  };

  it("maps fields section placeholders to values", () => {
    const template: ReportTemplate = {
      name: "Test Template",
      sections: [{
        id: "info",
        title: "Info",
        type: "fields",
        fields: [
          { id: "vehicle-make", label: "Make", type: "text" },
          { id: "light-source", label: "Light", type: "text" },
        ],
      }],
    };

    const response: AgentResponse = {
      ...baseResponse,
      sections: {
        info: { "vehicle-make": "Audi Q6", "light-source": "LED" },
      },
    };

    const map = buildPlaceholderMap(response, template);
    expect(map["{vehicle-make}"]).toBe("Audi Q6");
    expect(map["{light-source}"]).toBe("LED");
  });

  it("maps markdown sections with stripping", () => {
    const template: ReportTemplate = {
      name: "Test",
      sections: [{ id: "assessment", title: "Assessment", type: "markdown" }],
    };

    const response: AgentResponse = {
      ...baseResponse,
      sections: { assessment: "## All checks **pass**." },
    };

    const map = buildPlaceholderMap(response, template);
    expect(map["{assessment}"]).toBe("All checks pass.");
  });

  it("maps verdict placeholder", () => {
    const template: ReportTemplate = {
      name: "Test",
      sections: [{ id: "result", title: "Result", type: "verdict" }],
    };

    const passResp: AgentResponse = { ...baseResponse, verdict: "PASS" };
    const failResp: AgentResponse = { ...baseResponse, verdict: "FAIL" };

    expect(buildPlaceholderMap(passResp, template)["{verdict}"]).toBe("PASS");
    expect(buildPlaceholderMap(failResp, template)["{verdict}"]).toBe("FAIL");
  });

  it("maps table sections with stripping", () => {
    const template: ReportTemplate = {
      name: "Test",
      sections: [{ id: "results-table", title: "Results", type: "table", columns: ["Name", "Value"] }],
    };

    const response: AgentResponse = {
      ...baseResponse,
      sections: { "results-table": "| Name | Value |\n| Test | 123 |" },
    };

    const map = buildPlaceholderMap(response, template);
    expect(map["{results-table}"]).toBe("Name  Value \n Test  123");
  });

  it("returns empty map for template with no sections", () => {
    const template: ReportTemplate = { name: "Empty", sections: [] };
    const map = buildPlaceholderMap(baseResponse, template);
    expect(Object.keys(map)).toHaveLength(0);
  });

  it("skips fields with undefined values in response", () => {
    const template: ReportTemplate = {
      name: "Test",
      sections: [{
        id: "info",
        title: "Info",
        type: "fields",
        fields: [
          { id: "present", label: "P", type: "text" },
          { id: "missing", label: "M", type: "text" },
        ],
      }],
    };

    const response: AgentResponse = {
      ...baseResponse,
      sections: { info: { present: "Value" } },
    };

    const map = buildPlaceholderMap(response, template);
    expect(map["{present}"]).toBe("Value");
    expect(map["{missing}"]).toBeUndefined();
  });
});
