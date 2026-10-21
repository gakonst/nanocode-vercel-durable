import type { ModelProvider } from "nanocode-ts";

export type Selection = { provider: ModelProvider; model: string };

export const harnesses: { id: ModelProvider; label: string; models: { id: string; label: string }[] }[] = [
  { id: "claude", label: "Claude", models: [{ id: "claude-haiku-5-5", label: "Haiku 5.5" }, { id: "claude-sonnet-5-5", label: "Sonnet 5.5" }, { id: "claude-opus-5-5", label: "Opus 5.5" }] },
  { id: "codex", label: "Codex", models: [{ id: "gpt-6-luna", label: "Luna" }, { id: "gpt-6.1-sol", label: "Sol" }, { id: "gpt-6-astra", label: "Astra" }] },
];

export const provider: ModelProvider = process.env.NANOCODE_PROVIDER === "codex" ? "codex" : "claude";

export const model = process.env.NANOCODE_MODEL ?? (provider === "codex" ? "gpt-6-luna" : "claude-sonnet-5-5");

export const defaultSelection: Selection = { model, provider };

export function selection(harness: unknown, chosen: unknown): Selection | undefined {
  const entry = harnesses.find(candidate => candidate.id === harness);
  if (!entry || !entry.models.some(candidate => candidate.id === chosen)) return undefined;
  return { model: chosen as string, provider: entry.id };
}
