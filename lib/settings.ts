import type { ModelProvider } from "nanocode-ts";
import type { ServiceTier, Thinking } from "nanocode-ts/vercel";

export type { Thinking };

export type Selection = { provider: ModelProvider; model: string; thinking: Thinking; max_tokens?: number; service_tier?: ServiceTier };

export type Model = { id: string; label: string; name: string; efforts: Thinking[]; effort: Thinking; maxTokens?: number; serviceTier?: ServiceTier };

const every: Thinking[] = ["none", "low", "medium", "high", "xhigh", "max"];

const thinking: Thinking[] = ["low", "medium", "high", "xhigh", "max"];

export const harnesses: { id: ModelProvider; label: string; models: Model[] }[] = [
  { id: "claude", label: "Claude", models: [{ id: "claude-haiku-5-5", label: "Haiku 5.5", name: "Claude Haiku 5.5", efforts: every, effort: "medium" }, { id: "claude-sonnet-5-5", label: "Sonnet 5.5", name: "Claude Sonnet 5.5", efforts: thinking, effort: "high" }, { id: "zai/glm-5.3", label: "GLM-5.3", name: "GLM-5.3", efforts: ["low", "medium", "high"], effort: "low", maxTokens: 1_000_000 }, { id: "moonshotai/kimi-k3", label: "Kimi K3", name: "Kimi K3", efforts: ["low", "high"], effort: "low", maxTokens: 131_072 }] },
  { id: "codex", label: "Codex", models: [{ id: "gpt-6-luna", label: "Luna", name: "GPT-6 Luna", efforts: every, effort: "medium", serviceTier: "priority" }, { id: "gpt-6.1-sol", label: "Sol", name: "GPT-6.1 Sol", efforts: thinking, effort: "medium", serviceTier: "priority" }, { id: "glm-5.3", label: "GLM-5.3", name: "GLM-5.3", efforts: ["low", "medium", "high"], effort: "low" }, { id: "kimi-k3", label: "Kimi K3", name: "Kimi K3", efforts: ["low", "high"], effort: "low" }] },
];

export const provider: ModelProvider = process.env.NANOCODE_PROVIDER === "claude" ? "claude" : "codex";

export const model = process.env.NANOCODE_MODEL ?? (provider === "codex" ? "kimi-k3" : "claude-sonnet-5-5");

export function find(chosen: string): Model | undefined {
  return harnesses.flatMap(entry => entry.models).find(candidate => candidate.id === chosen);
}

export const defaultSelection: Selection = { model, provider, thinking: find(model)?.effort ?? "medium", ...limit(find(model)) };

function limit(found: Model | undefined): { max_tokens?: number; service_tier?: ServiceTier } {
  return { ...(found?.maxTokens ? { max_tokens: found.maxTokens } : {}), ...(found?.serviceTier ? { service_tier: found.serviceTier } : {}) };
}

export function selection(harness: unknown, chosen: unknown, effort: unknown): Selection | undefined {
  const entry = harnesses.find(candidate => candidate.id === harness);
  const found = entry?.models.find(candidate => candidate.id === chosen);
  if (!entry || !found) return undefined;
  if (effort === undefined) return { model: found.id, provider: entry.id, thinking: found.effort, ...limit(found) };
  if (!found.efforts.includes(effort as Thinking)) return undefined;
  return { model: found.id, provider: entry.id, thinking: effort as Thinking, ...limit(found) };
}
