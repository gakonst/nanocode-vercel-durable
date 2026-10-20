export const provider = process.env.NANOCODE_PROVIDER === "codex" ? "codex" : "claude";

export const model = process.env.NANOCODE_MODEL ?? (provider === "codex" ? "gpt-6-luna" : "claude-sonnet-5-5");
