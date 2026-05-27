import type { IDocStore } from "./types";
import { MockDocStore } from "./mock-store";

let _instance: IDocStore | null = null;

export function getDocStore(): IDocStore {
  if (!_instance) {
    _instance = new MockDocStore();
  }
  return _instance!;
}

export function setDocStore(store: IDocStore): void {
  _instance = store;
}
