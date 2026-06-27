import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { parseChecks } from "./skill/check-parser";
import type { ParsedCheck } from "./skill/check-parser";

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

export interface LoadPackOptions {
  packsDir?: string;
}

const DEFAULT_INDUSTRIES = ["General"];
const DEFAULT_ICON = "📋";
const DEFAULT_VERSION = "1.0.0";

export function loadPack(packName: string, options?: LoadPackOptions): SkillPack | null {
  const packsDir = options?.packsDir ?? path.join(process.cwd(), "packs");
  const packDir = path.join(packsDir, packName);
  const metaPath = path.join(packDir, "meta.json");
  const skillPath = path.join(packDir, "SKILL.md");

  if (!fs.existsSync(skillPath)) return null;

  let title = packName;
  let description = "";
  let industries = DEFAULT_INDUSTRIES;
  let icon = DEFAULT_ICON;
  let version = DEFAULT_VERSION;
  let methodology = "";

  if (fs.existsSync(metaPath)) {
    const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
    title = meta.title ?? title;
    description = meta.description ?? "";
    industries = meta.industries ?? industries;
    icon = meta.icon ?? icon;
    version = meta.version ?? version;
    methodology = meta.methodology ?? "";
  }

  const raw = fs.readFileSync(skillPath, "utf-8");
  const parsed = matter(raw);
  const data = parsed.data ?? {};

  const regs: string[] = data.regulation_ids ?? [];
  const rawDocs: unknown[] = data.documents ?? [];
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

  const checks = parseChecks(parsed.content);
  const packChecks: PackCheck[] = checks.map((c, i) => ({
    id: `C${i + 1}`,
    title: humanize(c.field),
    desc: c.description ?? "",
  }));

  if (documents.length === 0) {
    const inferredFields = checks.map((c) => ({
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
    id: packName,
    title,
    desc: description,
    regs,
    inds: industries,
    icon,
    version,
    methodology,
    checks: packChecks,
    documents,
  };
}

export function listPacks(packsDir?: string): string[] {
  const dir = packsDir ?? path.join(process.cwd(), "packs");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() &&
      fs.existsSync(path.join(dir, d.name, "meta.json")) &&
      fs.existsSync(path.join(dir, d.name, "SKILL.md")))
    .map((d) => d.name);
}


