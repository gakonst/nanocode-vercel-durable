import type { ModelProvider } from "nanocode-ts";
import type { Thinking } from "nanocode-ts/vercel";

export type { Thinking };

export type Selection = { provider: ModelProvider; model: string; thinking: Thinking };

export type Model = { id: string; label: string; efforts: Thinking[]; effort: Thinking };

const every: Thinking[] = ["none", "low", "medium", "high", "xhigh", "max"];

const thinking: Thinking[] = ["low", "medium", "high", "xhigh", "max"];

export const harnesses: { id: ModelProvider; label: string; models: Model[] }[] = [
  { id: "claude", label: "Claude", models: [{ id: "claude-haiku-5-5", label: "Haiku 5.5", efforts: every, effort: "medium" }, { id: "claude-sonnet-5-5", label: "Sonnet 5.5", efforts: thinking, effort: "high" }, { id: "claude-opus-5-5", label: "Opus 5.5", efforts: thinking, effort: "medium" }] },
  { id: "codex", label: "Codex", models: [{ id: "gpt-6-luna", label: "Luna", efforts: every, effort: "medium" }, { id: "gpt-6.1-sol", label: "Sol", efforts: thinking, effort: "medium" }, { id: "gpt-6-astra", label: "Astra", efforts: thinking, effort: "low" }] },
];

export const provider: ModelProvider = process.env.NANOCODE_PROVIDER === "codex" ? "codex" : "claude";

export const model = process.env.NANOCODE_MODEL ?? (provider === "codex" ? "gpt-6-luna" : "claude-sonnet-5-5");

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
