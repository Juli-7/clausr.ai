import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { SkillLoadError } from "../../pipeline/errors";
import { parseChecks } from "../../loading/skill/check-parser";
import type { ParsedCheck } from "../../loading/skill/check-parser";

const SKILLS_DIR = path.join(process.cwd(), "packs");

export interface SkillLoader {
  /** L1: metadata */
  name: string;
  description: string;
  triggers: string[];
  /** L2: full SKILL.md body (minus frontmatter) */
  skillmd: string;
  /** Scripts available via function calling */
  scripts: { name: string; path: string; desc: string; params: string }[];
  /** Parsed checks from ## Checks table, empty if not present */
  checks: ParsedCheck[];
  /** Regulation IDs derived from checks' clause column */
  regulationIds: string[];
  /** Whether a .docx report template exists in assets/ */
  hasTemplate: boolean;
}

/**
 * Load a skill folder and parse its SKILL.md frontmatter + body.
 * The knowledge layer is concerned ONLY with the skill definition
 * (metadata, checks, scripts). Report templates live in the output layer.
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

  const checks = parseChecks(parsed.content);
  const regulationIds: string[] = parsed.data?.regulation_ids ?? [];
  const templatePath = path.join(skillDir, "assets", "template.docx");
  const hasTemplate = fs.existsSync(templatePath);

  return {
    name,
    description,
    triggers,
    skillmd: parsed.content.trim(),
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
    fs.writeFileSync(path.join(skillDir, "meta.json"), JSON.stringify({ createdBy }, null, 2), "utf-8");
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
