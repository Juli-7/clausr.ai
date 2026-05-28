export class StepMemory {
  private outputs: Record<string, unknown> = {};

  write(stepNumber: number, value: unknown): void {
    this.outputs[String(stepNumber)] = value;
  }

  read(stepNumber: number): unknown {
    return this.outputs[String(stepNumber)];
  }

  latest(): { stepNumber: number; value: unknown } | null {
    const keys = Object.keys(this.outputs)
      .filter((k) => !isNaN(Number(k)))
      .sort((a, b) => Number(a) - Number(b));
    if (keys.length === 0) return null;
    const key = keys[keys.length - 1]!;
    return { stepNumber: Number(key), value: this.outputs[key] };
  }

  getRaw(key: string): unknown {
    return this.outputs[key];
  }

  setRaw(key: string, value: unknown): void {
    this.outputs[key] = value;
  }

  entries(): Record<string, unknown> {
    return { ...this.outputs };
  }
}
