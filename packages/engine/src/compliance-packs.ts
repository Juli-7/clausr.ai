import { loadPack, listPacks } from "./agent/loading/skill/loader";
import type { SkillPack } from "./agent/loading/skill/loader";

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
export const allRegs: readonly string[] = _index.regs;
export const allInds: readonly string[] = _index.inds;

export function searchPacks(filters: { query?: string; regulation?: string; industry?: string }): SkillPack[] {
  let result = [...packs];
  if (filters.query) {
    const q = filters.query.toLowerCase();
    result = result.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.desc.toLowerCase().includes(q) ||
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
