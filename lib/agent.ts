import type { HostTool } from "durable-harness";
import { createWallets } from "nanocode-ts/machines/vercel";
import { createNanocode } from "nanocode-ts/vercel";
import { defaultSelection, harnesses } from "./settings.ts";
import { type Charge, chargeTool } from "./tools.ts";

export const appTools = (record: (charge: Charge) => Promise<void> | void): HostTool[] => [chargeTool(record)];

const token = process.env.CHAT_TOKEN;

const isPublic = !token && process.env.CHAT_PUBLIC === "1";

const authorize = (request: Request) => {
  if (token && request.headers.get("authorization") !== `Bearer ${token}`) throw new Response("unauthorized", { status: 401 });
};

export const wallets = createWallets({
  sessions: () => nanocode.agent.sessions,
  secret: process.env.KEY_SECRET,
  authorize: request => {
    if (!token && !isPublic && process.env.NODE_ENV === "production") throw new Response("set CHAT_TOKEN or CHAT_PUBLIC=1", { status: 401 });
    authorize(request);
  },
  scripts: true,
  ...(process.env.TEMPO_RPC ? { rpc: process.env.TEMPO_RPC } : {}),
});

export const nanocode = createNanocode({
  harnesses,
  defaultSelection,
  tools: appTools(charge => console.log(JSON.stringify({ charge }))),
  report: drive => console.log(JSON.stringify({ drive })),
  sessionFetch: wallets.fetch,
  promptImages: session => /^(?:claude-|gpt-)/.test(session.model ?? ""),
  hands: false,
  durability: process.env.NANOCODE_DURABILITY === "strict" ? "strict" : "on",
  directDriveMs: 280_000,
  marks: process.env.HARNESS_MARKS === "1",
  chaos: process.env.HARNESS_CHAOS === "1",
  authorize: token ? authorize : isPublic ? "public" : undefined,
  mcp: wallets.mcp,
  ...(isPublic ? { maxPrompts: 20, maxPromptCharacters: 2000 } : {}),
});

export const agent = nanocode.agent;
