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
}

export interface SkillLoader {
  name: string;
  description: string;
  triggers: string[];
  skillmd: string;
  scripts: { name: string; path: string; desc: string; params: string }[];
  checks: ParsedCheck[];
  regulationIds: string[];
  hasTemplate: boolean;
}

export interface LoadPackOptions {
  packsDir?: string;
}

interface PackFileData {
  pack?: {
    title?: string;
    industries?: string[];
    icon?: string;
    version?: string;
    author?: string;
    methodology?: string;
  };
  skillmd?: string;
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

// ── Pack (marketplace) functions ──

export function loadPack(packName: string, options?: LoadPackOptions): SkillPack | null {
  const packsDir = options?.packsDir ?? SKILLS_DIR;
  const packDir = path.join(packsDir, packName);
  const skillPath = path.join(packDir, "SKILL.md");
  if (!fs.existsSync(skillPath)) return null;

  const raw = fs.readFileSync(skillPath, "utf-8");
  const parsed = matter(raw);
  const frontmatter = parsed.data ?? {};

  const packFile = loadPackFile<PackFileData>(packDir);
  const docPack = packFile?.pack ?? {};

  const title = (docPack.title as string) ?? packName;
  const description = (frontmatter.description as string) ?? "";
  const industries = (docPack.industries as string[]) ?? DEFAULT_INDUSTRIES;
  const icon = (docPack.icon as string) ?? DEFAULT_ICON;
  const version = (docPack.version as string) ?? DEFAULT_VERSION;
  const methodology = (docPack.methodology as string) ?? "";
  const regs: string[] = frontmatter.regulation_ids ?? [];

  const parsedChecks: ParsedCheck[] = packFile?.checks ?? parseChecks(parsed.content);
  const packChecks: PackCheck[] = parsedChecks.map((c, i) => ({
    id: `C${i + 1}`,
    title: humanize(c.field),
    desc: c.description ?? "",
  }));

  let documents = loadDocuments(packFile?.documents ?? frontmatter.documents as Record<string, unknown>[] | undefined);
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

export function loadSkill(skillId: string): SkillLoader {
  const skillDir = path.join(SKILLS_DIR, skillId);
  const skillMdPath = path.join(skillDir, "SKILL.md");

  if (!fs.existsSync(skillMdPath)) {
    throw new SkillLoadError("SKILL_NOT_FOUND", `Skill "${skillId}" not found: no SKILL.md at ${skillMdPath}`, skillId);
  }

  const raw = fs.readFileSync(skillMdPath, "utf-8");
  const parsed = matter(raw);

  const description = parsed.data?.description ?? "";
  const triggers: string[] = parsed.data?.triggers ?? [];
  const regulationIds: string[] = parsed.data?.regulation_ids ?? [];

  // Try compiled pack.json first for skillmd + checks
  const packFile = loadPackFile<PackFileData>(skillDir);
  const skillmd = packFile?.skillmd ?? parsed.content.trim();
  const checks = packFile?.checks ?? parseChecks(parsed.content);

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
    skillmd,
    scripts,
    checks,
    regulationIds,
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
    // fall through to generic description
  }
  return `Script: ${filename}`;
}
