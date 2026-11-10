import type { Contracts } from "nanocode-ts";
import { Plans } from "nanocode-ts/client";
import { models } from "nanocode-ts/models";
import type { Harness } from "nanocode-ts/vercel";

type ModelProvider = Contracts.ModelProvider;
type ServiceTier = Harness.ServiceTier;
type Thinking = Harness.Thinking;

export type { Thinking };

export type Selection = { provider: ModelProvider; model: string; thinking: Thinking; max_tokens?: number; service_tier?: ServiceTier };

export type Model = { id: string; label: string; name: string; detail?: string; efforts: Thinking[]; effort: Thinking; maxTokens?: number; serviceTier?: ServiceTier };

function catalog(harness: ModelProvider, id: string, label: string, detail: string): Model {
  const entry = models.harnesses.find(candidate => candidate.id === harness)?.models.find(candidate => candidate.id === id);
  if (!entry?.gateways.includes("vercel")) throw new Error(`nanocode-ts's ${harness} catalog has no ${id} that the Vercel AI Gateway serves`);
  return { id, label, name: entry.name, detail, efforts: entry.efforts, effort: entry.effort, ...(entry.priority ? { serviceTier: "priority" as const } : {}) };
}

export const harnesses: { id: ModelProvider; label: string; models: Model[] }[] = [
  { id: "claude", label: "Claude", models: [catalog("claude", "claude-haiku-5-5", "Haiku 5.5", "Fastest for quick answers"), catalog("claude", "claude-sonnet-5-5", "Sonnet 5.5", "Smart, efficient model for everyday use"), { id: "zai/glm-5.3", label: "GLM-5.3", name: "GLM-5.3", detail: "Open-weight model from Z.ai", efforts: ["low", "medium", "high"], effort: "low", maxTokens: 1_000_000 }, { id: "moonshotai/kimi-k3", label: "Kimi K3", name: "Kimi K3", detail: "Open-weight model from Moonshot AI", efforts: ["low", "high"], effort: "low", maxTokens: 131_072 }] },
  { id: "codex", label: "Codex", models: [catalog("codex", "gpt-6-luna", "Luna", "Fast for everyday questions"), catalog("codex", "gpt-6.1-sol", "Sol", "Thinks longer for harder problems"), catalog("codex", "glm-5.3", "GLM-5.3", "Open-weight model from Z.ai"), catalog("codex", "kimi-k3", "Kimi K3", "Open-weight model from Moonshot AI")] },
];

export const planHarnesses: { id: ModelProvider; label: string; models: Model[] }[] = harnesses.map(harness => ({
  ...harness,
  models: (models.harnesses.find(candidate => candidate.id === harness.id)?.models ?? [])
    .filter(model => Plans.serves(harness.id, model.id))
    .map(model => ({ id: model.id, label: model.name, name: model.name, efforts: model.efforts, effort: model.effort })),
}));

export const provider: ModelProvider = process.env.NANOCODE_PROVIDER === "codex" ? "codex" : "claude";

export const model = process.env.NANOCODE_MODEL ?? (provider === "codex" ? "gpt-6-luna" : "claude-haiku-5-5");

export function find(chosen: string): Model | undefined {
  return harnesses.flatMap(entry => entry.models).find(candidate => candidate.id === chosen);
}

export const defaultSelection: Selection = { model, provider, thinking: find(model)?.efforts.includes("low") ? "low" : find(model)?.effort ?? "medium", ...limit(find(model)) };

function limit(found: Model | undefined): { max_tokens?: number; service_tier?: ServiceTier } {
  return { ...(found?.maxTokens ? { max_tokens: found.maxTokens } : {}), ...(found?.serviceTier ? { service_tier: found.serviceTier } : {}) };
}
