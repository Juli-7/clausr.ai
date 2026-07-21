import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { SkillLoadError } from "../../pipeline/errors";
import { parseChecks } from "../../loading/skill/check-parser";
import type { ParsedCheck, CheckFieldType } from "../../loading/skill/check-parser";

export const SKILLS_DIR = path.join(process.cwd(), "packs");

// ── Shared types ──

export interface PackField {
  id: string;
  label: string | Record<string, string>;
  type?: "text" | "textarea" | "number" | "boolean" | "select" | "date";
  required?: boolean;
  options?: { value: string; label: string | Record<string, string> }[];
  validation?: { min?: number; max?: number; maxLength?: number };
}

export interface DocumentTemplate {
  type: string;
  title: string | Record<string, string>;
  template?: string;
  fields: string[];
}

export interface PackCheck {
  id: string;
  field: string;
  type: "number" | "boolean" | "narrative" | "string" | "enum";
  description: string;
  clause?: string;
  constraint?: string;
  rounding?: number;
  depends_on?: string[];
  sample?: string;
  testProcedure?: string;
  regulationNodeId?: string;
}

export interface SkillPack {
  id: string;
  title: string | Record<string, string>;
  desc: string | Record<string, string>;
  regs: string[];
  inds: string[];
  icon: string;
  version: string;
  fields: PackField[];
  documents: DocumentTemplate[];
  checks: PackCheck[];
  redlines: string[];
  lessons: string[];
}

export interface SkillLoader {
  name: string;
  description: string;
  triggers: string[];
  skillmd: string;
  scripts: { name: string; path: string; desc: string; params: string }[];
  checks: ParsedCheck[];
  regulationIds: string[];
  redlines: string[];
  lessons: string[];
  hasTemplate: boolean;
}

export interface LoadPackOptions {
  packsDir?: string;
}

interface PackFileData {
  pack?: {
    title?: string | Record<string, string>;
    description?: string | Record<string, string>;
    industries?: string[];
    icon?: string;
    version?: string;
    author?: string;
    regulation_ids?: string[];
  };
  regulation_ids?: string[];
  fields?: Record<string, unknown>[];
  documents?: Record<string, unknown>[];
  checks?: Record<string, unknown>[];
  redlines?: string[];
  lessons?: string[];
}

// ── Helpers ──

const DEFAULT_INDUSTRIES = ["General"];
const DEFAULT_ICON = "📋";
const DEFAULT_VERSION = "1.0.0";

function loadPackFile<T>(dir: string): T | null {
  for (const name of ["pack.json", "documents.json"]) {
    const p = path.join(dir, name);
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf-8")) as T;
  }
  return null;
}

function humanize(field: string): string {
  return field.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function loadFields(fieldList: Record<string, unknown>[] | undefined): PackField[] {
  if (!fieldList || fieldList.length === 0) return [];
  return fieldList.map((f) => ({
    id: f.id as string,
    label: f.label as string | Record<string, string>,
    type: (f.type ?? "text") as PackField["type"],
    required: f.required === true,
    options: f.options as { value: string; label: string | Record<string, string> }[] | undefined,
    validation: f.validation as { min?: number; max?: number; maxLength?: number } | undefined,
  }));
}

function loadDocuments(docList: Record<string, unknown>[] | undefined): DocumentTemplate[] {
  if (!docList || docList.length === 0) return [];
  return docList.map((d) => ({
    type: d.type as string,
    title: d.title as string | Record<string, string>,
    template: d.template as string | undefined,
    fields: (d.fields as string[]) ?? [],
  }));
}

function buildSkillmd(checks: ParsedCheck[], redlines: string[], lessons: string[]): string {
  const sections: string[] = [];

  if (checks.length > 0) {
    const checkBlocks = checks.map((c) => {
      const lines: string[] = [`### ${c.field}`];
      let idx = 1;
      if (c.type.kind === "enum") {
        lines.push(`${idx++}. **type**: enum(${c.type.values?.join(", ") ?? ""})`);
      } else {
        lines.push(`${idx++}. **type**: ${c.type.kind}`);
      }
      if (c.description) lines.push(`${idx++}. **description**: ${c.description}`);
      if (c.clause) lines.push(`${idx++}. **clause**: ${c.clause}`);
      if (c.sample) lines.push(`${idx++}. **sample**: ${c.sample}`);
      if (c.constraint) lines.push(`${idx++}. **constraint**: ${c.constraint}`);
      if (c.dependsOn) lines.push(`${idx++}. **depends_on**: ${c.dependsOn}`);
      if (c.attention) lines.push(`${idx++}. **attention**: ${c.attention}`);
      if (c.rounding) lines.push(`${idx++}. **rounding**: ${c.rounding}`);
      if (c.testProcedure) lines.push(`${idx++}. **test_procedure**: ${c.testProcedure}`);
      return lines.join("\n");
    });
    sections.push("## Checks\n\n" + checkBlocks.join("\n\n"));
  }

  if (redlines.length > 0) {
    sections.push("## Red Lines\n\n" + redlines.map((r) => `- ❌ ${r}`).join("\n"));
  }

  if (lessons.length > 0) {
    sections.push("## Lessons Learnt\n\n" + lessons.map((l) => `- ${l}`).join("\n"));
  }

  return sections.join("\n\n");
}

// ── Pack (marketplace) functions ──

function loadChecks(checkList: Record<string, unknown>[] | undefined): PackCheck[] {
  if (!checkList || checkList.length === 0) return [];
  return checkList.map((c) => ({
    id: c.id as string,
    field: c.field as string,
    type: (c.type ?? "narrative") as PackCheck["type"],
    description: (c.description ?? "") as string,
    clause: c.clause as string | undefined,
    constraint: c.constraint as string | undefined,
    rounding: c.rounding as number | undefined,
    depends_on: c.depends_on as string[] | undefined,
    sample: c.sample as string | undefined,
    testProcedure: c.testProcedure as string | undefined,
    regulationNodeId: c.regulationNodeId as string | undefined,
  }));
}

export function loadPack(packName: string, options?: LoadPackOptions): SkillPack | null {
  const packsDir = options?.packsDir ?? SKILLS_DIR;
  const packDir = path.join(packsDir, packName);
  const skillPath = path.join(packDir, "SKILL.md");
  if (!fs.existsSync(skillPath)) return null;

  const packFile = loadPackFile<PackFileData>(packDir);
  const docPack = packFile?.pack ?? {};

  const title = docPack.title ?? packName;
  const description = docPack.description ?? "";
  const industries = docPack.industries ?? DEFAULT_INDUSTRIES;
  const icon = docPack.icon ?? DEFAULT_ICON;
  const version = docPack.version ?? DEFAULT_VERSION;
  const regs: string[] = docPack.regulation_ids ?? packFile?.regulation_ids ?? [];

  let fields = loadFields(packFile?.fields);
  if (fields.length === 0) {
    // Backward compat: infer a single field from the legacy checks
    const raw = fs.readFileSync(skillPath, "utf-8");
    const parsed = matter(raw);
    const parsedChecks = parseChecks(parsed.content);
    fields = parsedChecks.map((c) => ({
      id: c.field,
      label: humanize(c.field),
      required: true,
    }));
  }

  let documents = loadDocuments(packFile?.documents);
  if (documents.length === 0 && fields.length > 0) {
    documents.push({
      type: "default",
      title: typeof title === "string" ? title : title.en ?? "",
      fields: fields.map((f) => f.id),
    });
  }

  let checks = loadChecks(packFile?.checks);
  if (checks.length === 0 && fields.length > 0) {
    // Backward compat: create simple checks from fields
    checks = fields.map((f) => ({
      id: f.id,
      field: f.id,
      type: f.type === "number" ? "number" : "narrative" as PackCheck["type"],
      description: `Evaluate ${f.id}`,
    }));
  }

  return {
    id: packName, title, desc: description, regs,
    inds: industries, icon, version,
    fields, documents, checks,
    redlines: packFile?.redlines ?? [],
    lessons: packFile?.lessons ?? [],
  };
}

export function listPacks(packsDir?: string): string[] {
  const dir = packsDir ?? SKILLS_DIR;
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(dir, d.name, "SKILL.md")))
    .map((d) => d.name);
}

// ── Skill (pipeline runtime) functions ──

/**
 * Load a skill's runtime data.
 *
 * Preference order:
 * 1. If pack.json has `checks` → read everything from pack.json (never touches SKILL.md body)
 * 2. If pack.json exists but no `checks` → read pack metadata from pack.json,
 *    parse checks/redlines/lessons from SKILL.md (backward compat)
 * 3. If no pack.json → full SKILL.md fallback (legacy)
 */
function toParsedCheck(c: Record<string, unknown>): ParsedCheck {
  const typeMap: Record<string, CheckFieldType> = {
    number: { kind: "number" },
    boolean: { kind: "boolean" },
    string: { kind: "string" },
    narrative: { kind: "string" },
    enum: { kind: "enum", values: [] },
  };
  const rawType = c.type;
  return {
    field: c.field as string,
    type: typeof rawType === "string" ? (typeMap[rawType] ?? { kind: "string" }) : (rawType as CheckFieldType),
    attention: (c.attention as string) ?? null,
    constraint: (c.constraint as string) ?? null,
    clause: (c.clause as string) ?? null,
    dependsOn: (() => {
      const d = c.dependsOn ?? c.depends_on;
      return Array.isArray(d) ? d.join(", ") : (d as string) ?? null;
    })(),
    description: (c.description as string) ?? null,
    sample: (c.sample as string) ?? null,
    rounding: (c.rounding != null ? String(c.rounding) : null) as string | null,
    testProcedure: (c.testProcedure as string) ?? null,
    regulationNodeId: (c.regulationNodeId as string) ?? null,
  };
}

export function loadSkill(skillId: string): SkillLoader {
  const skillDir = path.join(SKILLS_DIR, skillId);
  const skillMdPath = path.join(skillDir, "SKILL.md");

  if (!fs.existsSync(skillMdPath)) {
    throw new SkillLoadError("SKILL_NOT_FOUND", `Skill "${skillId}" not found: no SKILL.md at ${skillMdPath}`, skillId);
  }

  const packFile = loadPackFile<PackFileData>(skillDir);

  // If pack.json has compiled checks, it's the single source of truth
  if (packFile?.checks) {
    const docPack = packFile.pack ?? {};
    const redlines = packFile.redlines ?? [];
    const lessons = packFile.lessons ?? [];

    // Discover scripts/
    const scriptsDir = path.join(skillDir, "scripts");
    const scripts: SkillLoader["scripts"] = [];
    if (fs.existsSync(scriptsDir)) {
      for (const f of fs.readdirSync(scriptsDir)) {
        if (!f.endsWith(".py")) continue;
        const name = f.replace(/\.py$/, "");
        scripts.push({
          name,
          path: path.join(scriptsDir, f),
          desc: getScriptDescription(path.join(scriptsDir, f), f),
          params: "",
        });
      }
    }

    const templatePath = path.join(skillDir, "assets", "template.docx");
    const hasTemplate = fs.existsSync(templatePath);

    const parsedChecks = packFile.checks.map((c) => toParsedCheck(c as Record<string, unknown>));

    return {
      name: skillId,
      description: typeof docPack.description === "string" ? docPack.description : (docPack.description?.en ?? ""),
      triggers: [],
      skillmd: buildSkillmd(parsedChecks, redlines, lessons),
      scripts,
      checks: parsedChecks,
      regulationIds: docPack.regulation_ids ?? [],
      redlines,
      lessons,
      hasTemplate,
    };
  }

  // Fallback: read from SKILL.md (legacy packs without compiled checks)
  const raw = fs.readFileSync(skillMdPath, "utf-8");
  const parsed = matter(raw);

  const description = parsed.data?.description ?? "";
  const triggers: string[] = parsed.data?.triggers ?? [];
  const regulationIds: string[] = parsed.data?.regulation_ids ?? [];

  let checks: ParsedCheck[];
  let redlines: string[];
  let lessons: string[];

  if (packFile) {
    // Partially compiled — use pack.json for metadata, SKILL.md for checks
    checks = parseChecks(parsed.content);
    redlines = packFile.redlines ?? [];
    lessons = packFile.lessons ?? [];
  } else {
    checks = parseChecks(parsed.content);
    redlines = extractRedlineList(parsed.content);
    lessons = extractLessonsList(parsed.content);
  }

  // Discover scripts/
  const scriptsDir = path.join(skillDir, "scripts");
  const scripts: SkillLoader["scripts"] = [];
  if (fs.existsSync(scriptsDir)) {
    for (const f of fs.readdirSync(scriptsDir)) {
      if (!f.endsWith(".py")) continue;
      const name = f.replace(/\.py$/, "");
      scripts.push({
        name,
        path: path.join(scriptsDir, f),
        desc: getScriptDescription(path.join(scriptsDir, f), f),
        params: "",
      });
    }
  }

  const templatePath = path.join(skillDir, "assets", "template.docx");
  const hasTemplate = fs.existsSync(templatePath);

  return {
    name: skillId,
    description,
    triggers,
    skillmd: buildSkillmd(checks, redlines, lessons),
    scripts,
    checks,
    regulationIds,
    redlines,
    lessons,
    hasTemplate,
  };
}

/**
 * Save a SKILL.md to the filesystem at skills/{name}/SKILL.md.
 * Creates the directory if needed. Optionally writes a meta.json with createdBy.
 */
function getScriptDescription(filePath: string, filename: string): string {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const docMatch = content.match(/^"""(.*?)"""/s);
    if (docMatch) return docMatch[1]?.trim() ?? "";
  } catch {
  }
  return `Script: ${filename}`;
}

function extractRedlineList(content: string): string[] {
  const sectionStart = content.indexOf("## Red Lines");
  if (sectionStart === -1) return [];
  let sectionEnd = content.indexOf("\n## ", sectionStart + 1);
  if (sectionEnd === -1) sectionEnd = content.length;
  const section = content.substring(sectionStart, sectionEnd);
  return section.split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("- ❌") || l.startsWith("-"))
    .map((l) => l.replace(/^-\s*[❌❌]?\s*/, "").trim())
    .filter(Boolean);
}

function extractLessonsList(content: string): string[] {
  const sectionStart = content.indexOf("## Lessons Learnt");
  if (sectionStart === -1) return [];
  let sectionEnd = content.indexOf("\n## ", sectionStart + 1);
  if (sectionEnd === -1) sectionEnd = content.length;
  const section = content.substring(sectionStart, sectionEnd);
  return section.split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("-"))
    .map((l) => l.replace(/^-\s*/, "").trim())
    .filter((l) => l && l !== "(System-maintained area, initially empty.)");
}


