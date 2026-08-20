import { getSetting } from "@clausr/platform-core";
import { setLLMConfig, setRetentionConfig, setRegulationApi } from "@clausr/engine";
import { MockRegulationApi } from "./compliance/mock-regulation-api";

export function syncEngineConfig(): void {
  const provider = getSetting("llm_provider");
  const model = getSetting("llm_model");
  const retentionDays = getSetting("retention_days");
  const maxSessions = getSetting("retention_max_sessions");

  if (provider || model) setLLMConfig({ provider: provider ?? undefined, model: model ?? undefined });
  if (retentionDays || maxSessions) setRetentionConfig({ retentionDays: retentionDays ?? undefined, maxSessions: maxSessions ?? undefined });

  setRegulationApi(new MockRegulationApi());
}
