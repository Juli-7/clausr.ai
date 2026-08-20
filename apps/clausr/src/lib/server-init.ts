import { syncEngineConfig } from "./sync-engine-config";

let initialized = false;

export function ensureEngineInit(): void {
  if (initialized) return;
  syncEngineConfig();
  initialized = true;
}

// Auto-init at module load (runs for page renders via layout.tsx)
ensureEngineInit();
