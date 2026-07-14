import fs from "fs";
import path from "path";
import { loadPack, listPacks, SKILLS_DIR } from "./agent/loading/skill/loader";
import type { SkillPack, PackField, DocumentTemplate, PackCheck } from "./agent/loading/skill/loader";

function packLabel(title: string | Record<string, string>): string {
  return typeof title === "string" ? title : (title.en ?? "");
}

function buildPackIndex() {
  const all = listPacks().map((name) => loadPack(name)).filter(Boolean) as SkillPack[];
  const regsSet = new Set<string>();
  const indsSet = new Set<string>();
  for (const p of all) {
    p.regs.forEach((r) => regsSet.add(r));
    p.inds.forEach((i) => indsSet.add(i));
  }
  return { all, regs: [...regsSet].sort(), inds: [...indsSet].sort() };
}

let _index = buildPackIndex();

export let packs: SkillPack[] = _index.all;

export function refreshPackIndex(): void {
  _index = buildPackIndex();
  packs = _index.all;
}
export function searchPacks(filters: { query?: string; regulation?: string; industry?: string }): SkillPack[] {
  let result = [...packs];
  if (filters.query) {
    const q = filters.query.toLowerCase();
    result = result.filter(
      (p) =>
        packLabel(p.title).toLowerCase().includes(q) ||
        packLabel(p.desc).toLowerCase().includes(q) ||
        p.regs.some((r) => r.toLowerCase().includes(q)) ||
        p.inds.some((i) => i.toLowerCase().includes(q))
    );
  }
  if (filters.regulation) {
    result = result.filter((p) =>
      p.regs.some((r) => r.toLowerCase() === filters.regulation!.toLowerCase())
    );
  }
  if (filters.industry) {
    result = result.filter((p) =>
      p.inds.some((i) => i.toLowerCase() === filters.industry!.toLowerCase())
    );
  }
  return result;
}

export function getPack(id: string): SkillPack | undefined {
  return packs.find((p) => p.id === id);
}

export function readPackContent(packId: string): { content: string; source: string } | null {
  const packDir = path.join(SKILLS_DIR, packId);
  const packJsonPath = path.join(packDir, "pack.json");
  const skillMdPath = path.join(packDir, "SKILL.md");

  if (fs.existsSync(packJsonPath)) {
    const raw = fs.readFileSync(packJsonPath, "utf-8");
    const formatted = JSON.stringify(JSON.parse(raw), null, 2);
    return { content: formatted, source: "pack.json" };
  }

  if (fs.existsSync(skillMdPath)) {
    const content = fs.readFileSync(skillMdPath, "utf-8");
    return { content, source: "SKILL.md" };
  }

  return null;
}

export interface CreatePackInput {
  id: string;
  title: string | Record<string, string>;
  description: string | Record<string, string>;
  industries: string[];
  icon?: string;
  version?: string;
  regulation_ids?: string[];
  fields: PackField[];
  documents: DocumentTemplate[];
  checks: PackCheck[];
  redlines: string[];
  lessons?: string[];
  templates?: { docType: string; dataUrl: string }[];
}

function formatChecksAsMd(checks: PackCheck[]): string {
  if (!checks.length) return "";
  const blocks = checks.map((c) => {
    const lines: string[] = [`### ${c.field}`];
    let idx = 1;
    lines.push(`${idx++}. **type**: ${c.type}`);
    if (c.description) lines.push(`${idx++}. **description**: ${c.description}`);
    if (c.clause) lines.push(`${idx++}. **clause**: ${c.clause}`);
    if (c.sample) lines.push(`${idx++}. **sample**: ${c.sample}`);
    if (c.constraint) lines.push(`${idx++}. **constraint**: ${c.constraint}`);
    if (c.depends_on?.length) lines.push(`${idx++}. **depends_on**: ${c.depends_on.join(", ")}`);
    if (c.rounding !== undefined) lines.push(`${idx++}. **rounding**: ${c.rounding}`);
    return lines.join("\n");
  });
  return "## Checks\n\n" + blocks.join("\n\n");
}

function formatLessonsAsMd(lessons: string[]): string {
  if (!lessons.length) return "";
  return "## Lessons Learnt\n\n" + lessons.map((l) => `- ${l}`).join("\n");
}

export function writePack(data: CreatePackInput): void {
  const packDir = path.join(SKILLS_DIR, data.id);

  const packJson = {
    pack: {
      title: data.title,
      description: data.description,
      industries: data.industries,
      icon: data.icon ?? "📋",
      version: data.version ?? "1.0.0",
      regulation_ids: data.regulation_ids ?? [],
    },
    fields: data.fields,
    documents: data.documents,
    checks: data.checks,
    redlines: data.redlines,
    lessons: data.lessons ?? [],
  };

  fs.mkdirSync(packDir, { recursive: true });
  fs.writeFileSync(path.join(packDir, "pack.json"), JSON.stringify(packJson, null, 2), "utf-8");

  const mdSections = [
    formatChecksAsMd(data.checks),
    ...(data.redlines.length ? [`## Red Lines\n\n${data.redlines.map((r) => `- ❌ ${r}`).join("\n")}`] : []),
    formatLessonsAsMd(data.lessons ?? []),
  ].filter(Boolean).join("\n\n");
  fs.writeFileSync(path.join(packDir, "SKILL.md"), mdSections, "utf-8");

  if (data.templates?.length) {
    const assetsDir = path.join(packDir, "assets");
    fs.mkdirSync(assetsDir, { recursive: true });
    for (const tpl of data.templates) {
      const b64 = tpl.dataUrl.split(",")[1] ?? tpl.dataUrl;
      fs.writeFileSync(path.join(assetsDir, `${tpl.docType}.docx`), Buffer.from(b64, "base64"));
    }
  }

  refreshPackIndex();
}

const DRAFTS_DIR = path.join(process.cwd(), "data", "pack-drafts");

function ensureDraftDir() {
  if (!fs.existsSync(DRAFTS_DIR)) fs.mkdirSync(DRAFTS_DIR, { recursive: true });
}

export function getDraftPack(sessionId: string): CreatePackInput | null {
  ensureDraftDir();
  const p = path.join(DRAFTS_DIR, `${sessionId}.json`);
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, "utf-8")); } catch { return null; }
}

export function saveDraftPack(sessionId: string, data: CreatePackInput): void {
  ensureDraftDir();
  fs.writeFileSync(path.join(DRAFTS_DIR, `${sessionId}.json`), JSON.stringify(data, null, 2), "utf-8");
}

export function clearDraftPack(sessionId: string): void {
  const p = path.join(DRAFTS_DIR, `${sessionId}.json`);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

export function appendPackLessons(skillName: string, newLessons: string[]): void {
  const packPath = path.join(SKILLS_DIR, skillName, "pack.json");
  if (!fs.existsSync(packPath)) return;
  const pack = JSON.parse(fs.readFileSync(packPath, "utf-8"));
  const existing: string[] = pack.lessons ?? [];
  pack.lessons = [...new Set([...existing, ...newLessons])];
  fs.writeFileSync(packPath, JSON.stringify(pack, null, 2), "utf-8");
  refreshPackIndex();
}
