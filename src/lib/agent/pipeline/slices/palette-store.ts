import type { CitationPaletteEntry, SourcePaletteEntry } from "../pipeline-context";

export interface LoadedReference {
  filename: string;
  content: string;
}

export class PaletteStore {
  private references: LoadedReference[] = [];
  private citationPalette: CitationPaletteEntry[] = [];

  loadReferences(refs: LoadedReference[]): void {
    this.references = refs;
  }

  getReferences(): readonly LoadedReference[] {
    return this.references;
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

  formatContextSummary(): string {
    if (this.citationPalette.length === 0) return "";

    const summary = this.citationPalette
      .map((e) => `[${e.id}] ${e.regulation} §${e.clause} — ${e.text.slice(0, 80)}`)
      .join("\n");
    return `Available Citations:\n${summary}`;
  }

  toJSON(): { references: LoadedReference[]; citationPalette: CitationPaletteEntry[] } {
    return { references: [...this.references], citationPalette: [...this.citationPalette] };
  }

  static fromJSON(data: { references: LoadedReference[]; citationPalette: CitationPaletteEntry[] }): PaletteStore {
    const store = new PaletteStore();
    store.loadReferences(data.references);
    store.loadCitationPalette(data.citationPalette);
    return store;
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
}
