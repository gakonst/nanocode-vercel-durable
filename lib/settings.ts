import type { ModelProvider } from "nanocode-ts";
import type { Thinking } from "nanocode-ts/vercel";

export type { Thinking };

export type Selection = { provider: ModelProvider; model: string; thinking: Thinking };

export type Model = { id: string; label: string; efforts: Thinking[]; effort: Thinking };

export const harnesses: { id: ModelProvider; label: string; models: Model[] }[] = [
  { id: "codex", label: "Codex", models: [{ id: "glm-5.3", label: "GLM-5.3", efforts: ["low", "medium", "high"], effort: "low" }, { id: "kimi-k3", label: "Kimi K3", efforts: ["low", "high"], effort: "low" }, { id: "mimo-v2.6-pro", label: "MiMo V2.6 Pro", efforts: ["low", "medium", "high"], effort: "low" }] },
];

export const provider: ModelProvider = process.env.NANOCODE_PROVIDER === "claude" ? "claude" : "codex";

export const model = process.env.NANOCODE_MODEL ?? (provider === "codex" ? "glm-5.3" : "claude-sonnet-5-5");

export function find(chosen: string): Model | undefined {
  return harnesses.flatMap(entry => entry.models).find(candidate => candidate.id === chosen);
}

export const defaultSelection: Selection = { model, provider, thinking: find(model)?.effort ?? "medium" };

export function selection(harness: unknown, chosen: unknown, effort: unknown): Selection | undefined {
  const entry = harnesses.find(candidate => candidate.id === harness);
  const found = entry?.models.find(candidate => candidate.id === chosen);
  if (!entry || !found) return undefined;
  if (effort === undefined) return { model: found.id, provider: entry.id, thinking: found.effort };
  if (!found.efforts.includes(effort as Thinking)) return undefined;
  return { model: found.id, provider: entry.id, thinking: effort as Thinking };
}
