import { getRegulationApi } from "@/lib/agent/knowledge/regulation-api";
import type { CitationPaletteEntry, SourcePaletteEntry } from "../pipeline-context";
import { logPipeline } from "../logger";

export interface LoadedReference {
  filename: string;
  content: string;
}

export interface RegulationSummary {
  code: string;
  title: string;
  description: string;
  clauseIndex: { number: string; title: string }[];
}

export class PaletteStore {
  private references: LoadedReference[] = [];
  private citationPalette: CitationPaletteEntry[] = [];
  private summaries: RegulationSummary[] = [];

  // ── Full reference texts ──

  loadReferences(refs: LoadedReference[]): void {
    this.references = refs;
  }

  getReferences(): readonly LoadedReference[] {
    return this.references;
  }

  // ── Regulation summaries (compact index of clause numbers + titles) ──

  loadSummaries(summaries: RegulationSummary[]): void {
    this.summaries = summaries;
  }

  getSummaries(): readonly RegulationSummary[] {
    return this.summaries;
  }

  findSummaryForRef(ref: string): RegulationSummary | undefined {
    return this.summaries.find((s) => ref.startsWith(s.code + "."));
  }

  getRegulationForRef(ref: string): string | null {
    for (const s of this.summaries) {
      if (ref.startsWith(s.code + ".")) return s.code;
    }
    return null;
  }

  // ── Citation palette (lazy-loaded, additive) ──

  addPaletteEntries(entries: CitationPaletteEntry[]): void {
    const existing = new Map(this.citationPalette.map((e) => [e.id, e]));
    for (const entry of entries) {
      if (!existing.has(entry.id)) {
        existing.set(entry.id, entry);
        this.citationPalette.push(entry);
      }
    }
  }

  loadCitationPalette(entries: CitationPaletteEntry[]): void {
    this.citationPalette = entries;
  }

  getCitationPalette(): readonly CitationPaletteEntry[] {
    return this.citationPalette;
  }

  findCitation(ref: string): CitationPaletteEntry | undefined {
    return this.citationPalette.find((e) => e.id === ref);
  }

  async resolveMissingRefs(refs: string[]): Promise<void> {
    const toResolve: string[] = [];
    for (const ref of refs) {
      if (this.citationPalette.some((e) => e.id === ref)) continue;
      if (this.findSummaryForRef(ref)) toResolve.push(ref);
    }
    if (toResolve.length === 0) return;

    const api = await getRegulationApi();
    const entries: CitationPaletteEntry[] = [];
    for (const ref of toResolve) {
      const regCode = this.getRegulationForRef(ref);
      if (!regCode) {
        logPipeline(`  [PALETTE] could not resolve regulation for ref "${ref}" — no matching summary`);
        continue;
      }
      const clauseNum = ref.substring(regCode.length + 1);
      try {
        const result = await api.getClause({ regulationCode: regCode, clauseNumber: clauseNum });
        if (result.success && result.data) {
          const text = result.data.title
            ? `\xA7${result.data.number} ${result.data.title}\n${result.data.text}`
            : `\xA7${result.data.number}\n${result.data.text}`;
          entries.push({ id: ref, regulation: regCode, clause: clauseNum, text });
        } else {
          logPipeline(`  [PALETTE] API returned failure for "${ref}": ${result.error ?? "unknown error"} — citation will be missing`);
        }
      } catch (err) {
        logPipeline(`  [PALETTE] API exception resolving "${ref}": ${err instanceof Error ? err.message : String(err)} — citation will be missing`);
      }
    }
    if (entries.length > 0) {
      this.addPaletteEntries(entries);
      logPipeline(`  [PALETTE] auto-resolved ${entries.length} citation(s): ${entries.map((e) => e.id).join(", ")}`);
    }
  }

  // ── Context summary for LLM system prompt ──

  formatContextSummary(): string {
    const parts: string[] = [];

    if (this.summaries.length > 0) {
      parts.push("# Available Regulations");
      for (const s of this.summaries) {
        const clauses = s.clauseIndex
          .map((c) => (c.title ? `\xA7${c.number} — ${c.title}` : `\xA7${c.number}`))
          .join(", ");
        parts.push(`${s.code} — ${s.title}\n  Clauses: ${clauses}`);
      }
    }

    if (this.citationPalette.length > 0) {
      parts.push("# Pre-loaded Citations");
      for (const e of this.citationPalette) {
        const textLines = e.text.split("\n");
        const firstLine = textLines[0]?.replace(/^\xA7\d+(\.\d+)*\s*/, "").trim() || "";
        const snippet = firstLine || (textLines[1] || "").slice(0, 80);
        parts.push(`[${e.id}] ${e.regulation} \xA7${e.clause} — ${snippet}`);
      }
    }

    return parts.join("\n\n");
  }

  formatSourceSummary(sourcePalette: SourcePaletteEntry[]): string {
    if (sourcePalette.length === 0) return "";
    const summary = sourcePalette
      .flatMap((s) => {
        const chunks = s.chunks?.map((c) => `[${s.id}] ${s.filename} — ${c.text.slice(0, 80)}`) ?? [];
        return chunks.length > 0 ? chunks : [`[S${s.id}] ${s.filename}`];
      })
      .join("\n");
    return `Source Chunks:\n${summary}`;
  }

  // ── Serialization ──

  toJSON(): { references: LoadedReference[]; citationPalette: CitationPaletteEntry[]; summaries: RegulationSummary[] } {
    return {
      references: [...this.references],
      citationPalette: [...this.citationPalette],
      summaries: [...this.summaries],
    };
  }

  static fromJSON(data: {
    references: LoadedReference[];
    citationPalette: CitationPaletteEntry[];
    summaries: RegulationSummary[];
  }): PaletteStore {
    const store = new PaletteStore();
    store.loadReferences(data.references);
    store.loadCitationPalette(data.citationPalette);
    store.loadSummaries(data.summaries);
    return store;
  }
}
