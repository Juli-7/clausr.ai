import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { SkillLoadError } from "@/lib/agent/pipeline/errors";
import type { ReportTemplate } from "@/lib/agent/template-types";

const SKILLS_DIR = path.join(process.cwd(), "skills");

export interface ClauseEntry {
  regulation: string;
  clause: string;
  text: string;
}

export interface SkillLoader {
  /** L1: metadata */
  name: string;
  description: string;
  triggers: string[];
  /** L2: full SKILL.md body (minus frontmatter) */
  skillmd: string;
  /** L3: reference files available for on-demand loading */
  references: { name: string; path: string; clauses: string }[];
  /** Scripts available via function calling */
  scripts: { name: string; path: string; desc: string; params: string }[];
  /** Report template (loaded from assets/template.json, optional) */
  template: ReportTemplate | null;
  /** Pre-parsed clause index from reference files (built at load time) */
  clauseIndex: ClauseEntry[];
}

/**
 * Load a skill folder and parse its SKILL.md frontmatter + body.
 * Returns L1 metadata, L2 SKILL.md content, and L3 reference/script listings.
 */
export function loadSkill(skillId: string): SkillLoader {
  const skillDir = path.join(SKILLS_DIR, skillId);
  const skillMdPath = path.join(skillDir, "SKILL.md");

  if (!fs.existsSync(skillMdPath)) {
    throw new SkillLoadError("SKILL_NOT_FOUND", `Skill "${skillId}" not found: no SKILL.md at ${skillMdPath}`, skillId);
  }

  const raw = fs.readFileSync(skillMdPath, "utf-8");
  const parsed = matter(raw);

  const name = parsed.data?.name ?? skillId;
  const description = parsed.data?.description ?? "";
  const triggers: string[] = parsed.data?.triggers ?? [];

  // Discover references/
  const refsDir = path.join(skillDir, "references");
  const references: SkillLoader["references"] = [];
  if (fs.existsSync(refsDir)) {
    for (const f of fs.readdirSync(refsDir)) {
      if (!f.endsWith(".md")) continue;
      const refPath = path.join(refsDir, f);
      const refContent = fs.readFileSync(refPath, "utf-8");
      // Extract heading-based clause markers from the reference file
      const clauses = extractClauses(refContent);
      references.push({
        name: f,
        path: refPath,
        clauses,
      });
    }
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

  // Load template (optional — skills without templates use default markdown layout)
  const assetsDir = path.join(skillDir, "assets");
  const templatePath = path.join(assetsDir, "template.json");
  let template: ReportTemplate | null = null;
  if (fs.existsSync(templatePath)) {
    try {
      const templateRaw = fs.readFileSync(templatePath, "utf-8");
      template = JSON.parse(templateRaw) as ReportTemplate;
    } catch (err) {
      console.error(`[loader] Failed to parse template for skill "${skillId}":`, err);
    }
  }

  // Pre-parse clause index from all reference files
  const clauseIndex: ClauseEntry[] = [];
  for (const ref of references) {
    const refPath = path.join(refsDir, ref.name);
    try {
      const refContent = fs.readFileSync(refPath, "utf-8");
      referenceCache.set(`${skillId}/${ref.name}`, refContent);
      const entries = parseClausesFromReference(refContent, ref.name);
      clauseIndex.push(...entries);
    } catch {
      // skip unreadable references
    }
  }

  return {
    name,
    description,
    triggers,
    skillmd: parsed.content.trim(),
    references,
    scripts,
    template,
    clauseIndex,
  };
}

// ── Reference content cache (avoid re-reading from disk) ──
const referenceCache = new Map<string, string>();

function parseClausesFromReference(content: string, filename: string): ClauseEntry[] {
  const regMatch = filename.match(/un-r(\d+)\.md/i);
  if (!regMatch) return [];
  const regulation = `R${regMatch[1]}`;

  const entries: ClauseEntry[] = [];
  const clauseRegex =
    /^(?:##\s*)?§?(\d+(?:\.\d+)*)\s*([^\n]*)\n+([^#]*?)(?=\n(?:##\s*)?§?\d|$)/gms;
  let match;
  while ((match = clauseRegex.exec(content)) !== null) {
    const clause = match[1];
    const title = match[2].trim();
    const text = match[3].trim();
    entries.push({
      regulation,
      clause,
      text: title ? `${title}\n${text}` : text,
    });
  }

  return entries;
}

/**
 * Discover all skill folders under skills/.
 */
export function listSkills(): string[] {
  if (!fs.existsSync(SKILLS_DIR)) return [];
  return fs
    .readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(SKILLS_DIR, d.name, "SKILL.md")))
    .map((d) => d.name);
}

/**
 * Load on-demand reference text by skillId + reference name.
 */
export function loadReference(skillId: string, refName: string): string {
  const cacheKey = `${skillId}/${refName}`;
  const cached = referenceCache.get(cacheKey);
  if (cached) return cached;

  const refPath = path.join(SKILLS_DIR, skillId, "references", refName);
  if (!fs.existsSync(refPath)) {
    throw new SkillLoadError("SKILL_NOT_FOUND", `Reference "${refName}" not found for skill "${skillId}"`, skillId, { refName });
  }
  const content = fs.readFileSync(refPath, "utf-8");
  referenceCache.set(cacheKey, content);
  return content;
}

/**
 * Extract clause markers (headings like "§5.11" or "## §5.11") from markdown reference text.
 */
function extractClauses(content: string): string {
  const markers: string[] = [];
  const regex = /(?:§\s*)?(\d+(?:\.\d+)*)|§(\d+(?:\.\d+)*)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    const clause = match[1] || match[2];
    if (clause && !markers.includes(clause)) {
      markers.push(`§${clause}`);
    }
  }
  return markers.join(", ");
}

function getScriptDescription(filePath: string, filename: string): string {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const docMatch = content.match(/^"""(.*?)"""/s);
    if (docMatch) return docMatch[1].trim();
  } catch {
    // fall through to generic description
  }
  return `Script: ${filename}`;
}
