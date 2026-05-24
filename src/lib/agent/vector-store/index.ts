import type { IDocStore } from "./types";

let _instance: IDocStore | null = null;

export function getDocStore(): IDocStore {
  if (!_instance) {
    const { MockDocStore } = require("./mock-store");
    _instance = new MockDocStore();
  }
  return _instance!;
}

export function setDocStore(store: IDocStore): void {
  _instance = store;
}
