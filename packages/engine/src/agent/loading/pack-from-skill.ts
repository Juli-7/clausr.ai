import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { loadSkill } from "./skill/loader";
import { SkillLoadError } from "../pipeline/errors";
import type { ParsedCheck } from "./skill/check-parser";

const SKILLS_DIR = path.join(process.cwd(), "skills");

export interface PackCheck {
  id: string;
  title: string;
  desc: string;
}

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

function humanize(field: string): string {
  return field
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const DEFAULT_INDUSTRIES = ["General"];
const DEFAULT_ICON = "📋";
const DEFAULT_VERSION = "1.0.0";

/**
 * Load a SKILL.md and build a SkillPack for the marketplace.
 * Frontmatter fields supported:
 *   name, title, description, industries, icon, version, methodology,
 *   triggers, regulation_ids, documents
 */
export function getPackFromSkill(skillName: string): SkillPack | null {
  let skill;
  try {
    skill = loadSkill(skillName);
  } catch (err) {
    if (err instanceof SkillLoadError && err.code === "SKILL_NOT_FOUND") {
      return null;
    }
    throw err;
  }

  const raw = fs.readFileSync(path.join(SKILLS_DIR, skillName, "SKILL.md"), "utf-8");
  const parsed = matter(raw);
  const data = parsed.data ?? {};

  const title: string = data.title ?? data.name ?? skillName;
  const description: string = data.description ?? "";
  const industries: string[] = data.industries ?? DEFAULT_INDUSTRIES;
  const icon: string = data.icon ?? DEFAULT_ICON;
  const version: string = data.version ?? DEFAULT_VERSION;
  const methodology: string = data.methodology ?? "";
  const regs: string[] = data.regulation_ids ?? [];
  const rawDocs: unknown[] = data.documents ?? [];

  const checks: PackCheck[] = skill.checks.map((c: ParsedCheck, i: number) => ({
    id: `C${i + 1}`,
    title: humanize(c.field),
    desc: c.description ?? "",
  }));

  const documents: DocumentTemplate[] = (rawDocs as Record<string, unknown>[]).map((d) => {
    const docFields = ((d.fields as Record<string, unknown>[]) ?? []).map((f) => ({
      field: f.field as string,
      label: f.label as string,
      type: (f.type ?? "text") as "text" | "textarea" | "date",
      required: f.required === true,
    }));
    return {
      type: d.type as string,
      title: d.title as string,
      fields: docFields,
    };
  });

  if (documents.length === 0) {
    const inferredFields = skill.checks.map((c: ParsedCheck) => ({
      field: c.field,
      label: humanize(c.field),
      type: "text" as const,
      required: true,
    }));
    documents.push({
      type: "default",
      title,
      fields: inferredFields,
    });
  }

  return {
    id: skillName,
    title,
    desc: description,
    regs,
    inds: industries,
    icon,
    version,
    methodology,
    checks,
    documents,
  };
}