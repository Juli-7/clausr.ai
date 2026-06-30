import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { SkillLoadError } from "../../pipeline/errors";
import { parseChecks } from "../../loading/skill/check-parser";
import type { ParsedCheck } from "../../loading/skill/check-parser";

const SKILLS_DIR = path.join(process.cwd(), "packs");

// ── Shared types ──

export interface DocumentField {
  field: string;
  label: string;
  type: "text" | "textarea" | "date";
  required: boolean;
}

export interface DocumentTemplate {
  type: string;
  title: string;
  fields: DocumentField[];
}

export interface PackCheck {
  id: string;
  title: string;
  desc: string;
}

export interface SkillPack {
  id: string;
  title: string;
  desc: string;
  regs: string[];
  inds: string[];
  icon: string;
  version: string;
  methodology: string;
  checks: PackCheck[];
  documents: DocumentTemplate[];
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
    title?: string;
    description?: string;
    industries?: string[];
    icon?: string;
    version?: string;
    author?: string;
    methodology?: string;
    regulation_ids?: string[];
    triggers?: string[];
  };
  redlines?: string[];
  lessons?: string[];
  checks?: ParsedCheck[];
  documents?: Record<string, unknown>[];
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

function loadDocuments(docList: Record<string, unknown>[] | undefined): DocumentTemplate[] {
  if (!docList || docList.length === 0) return [];
  return docList.map((d) => ({
    type: d.type as string,
    title: d.title as string,
    fields: ((d.fields as Record<string, unknown>[]) ?? []).map((f) => ({
      field: f.field as string,
      label: f.label as string,
      type: (f.type ?? "text") as "text" | "textarea" | "date",
      required: f.required === true,
    })),
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

export function loadPack(packName: string, options?: LoadPackOptions): SkillPack | null {
  const packsDir = options?.packsDir ?? SKILLS_DIR;
  const packDir = path.join(packsDir, packName);
  const skillPath = path.join(packDir, "SKILL.md");
  if (!fs.existsSync(skillPath)) return null;

  const packFile = loadPackFile<PackFileData>(packDir);
  const docPack = packFile?.pack ?? {};

  const title = (docPack.title as string) ?? packName;
  const description = (docPack.description as string) ?? "";
  const industries = (docPack.industries as string[]) ?? DEFAULT_INDUSTRIES;
  const icon = (docPack.icon as string) ?? DEFAULT_ICON;
  const version = (docPack.version as string) ?? DEFAULT_VERSION;
  const methodology = (docPack.methodology as string) ?? "";
  const regs: string[] = docPack.regulation_ids ?? [];

  let parsedChecks: ParsedCheck[];
  if (packFile?.checks) {
    parsedChecks = packFile.checks;
  } else {
    const raw = fs.readFileSync(skillPath, "utf-8");
    const parsed = matter(raw);
    parsedChecks = parseChecks(parsed.content);
  }

  const packChecks: PackCheck[] = parsedChecks.map((c, i) => ({
    id: `C${i + 1}`,
    title: humanize(c.field),
    desc: c.description ?? "",
  }));

  let documents = loadDocuments(packFile?.documents);
  if (documents.length === 0) {
    const inferredFields = parsedChecks.map((c) => ({
      field: c.field,
      label: humanize(c.field),
      type: "text" as const,
      required: true,
    }));
    documents.push({ type: "default", title, fields: inferredFields });
  }

  return {
    id: packName, title, desc: description, regs,
    inds: industries, icon, version, methodology,
    checks: packChecks, documents,
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

    return {
      name: skillId,
      description: docPack.description ?? "",
      triggers: docPack.triggers ?? [],
      skillmd: buildSkillmd(packFile.checks, redlines, lessons),
      scripts,
      checks: packFile.checks,
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
export function saveSkillToFs(name: string, fullText: string, createdBy?: string): void {
  const skillDir = path.join(SKILLS_DIR, name);
  if (!fs.existsSync(skillDir)) {
    fs.mkdirSync(skillDir, { recursive: true });
  }
  fs.writeFileSync(path.join(skillDir, "SKILL.md"), fullText, "utf-8");
  if (createdBy) {
    const packPath = path.join(skillDir, "pack.json");
    let pack = { pack: {} as Record<string, unknown> };
    if (fs.existsSync(packPath)) {
      pack = JSON.parse(fs.readFileSync(packPath, "utf-8"));
    }
    pack.pack = { ...pack.pack, author: createdBy };
    fs.writeFileSync(packPath, JSON.stringify(pack, null, 2), "utf-8");
  }
}

/**
 * Remove a skill directory from the filesystem at skills/{name}/.
 */
export function deleteSkillFromFs(name: string): void {
  const skillDir = path.join(SKILLS_DIR, name);
  if (fs.existsSync(skillDir)) {
    fs.rmSync(skillDir, { recursive: true, force: true });
  }
}

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

/**
 * Write compiled checks + redlines + lessons back to pack.json.
 * Used when saving lessons/redlines at runtime.
 */
export function saveCompiledPack(
  skillName: string,
  data: { checks?: ParsedCheck[]; redlines?: string[]; lessons?: string[] }
): void {
  const skillDir = path.join(SKILLS_DIR, skillName);
  const packPath = path.join(skillDir, "pack.json");
  let pack: PackFileData = { pack: {} };
  if (fs.existsSync(packPath)) {
    pack = JSON.parse(fs.readFileSync(packPath, "utf-8"));
  }
  if (!pack.pack) pack.pack = {};
  if (data.checks) pack.checks = data.checks;
  if (data.redlines) pack.redlines = data.redlines;
  if (data.lessons) {
    const existing = pack.lessons ?? [];
    const merged = [...new Set([...existing, ...data.lessons])];
    pack.lessons = merged;
  }
  fs.writeFileSync(packPath, JSON.stringify(pack, null, 2), "utf-8");
}
