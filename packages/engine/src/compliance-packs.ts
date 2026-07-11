import fs from "fs";
import path from "path";
import { loadPack, listPacks, SKILLS_DIR } from "./agent/loading/skill/loader";
import type { SkillPack } from "./agent/loading/skill/loader";

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

const _index = buildPackIndex();

export const packs: SkillPack[] = _index.all;
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
