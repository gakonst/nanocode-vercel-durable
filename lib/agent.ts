import type { HostTool } from "durable-harness";
import { createWallets } from "nanocode-ts/machines/vercel";
import { createNanocode } from "nanocode-ts/vercel";
import { defaultSelection, harnesses } from "./settings.ts";
import { type Charge, chargeTool } from "./tools.ts";

export const INSTRUCTIONS = "You are nanocode, a coding agent running in a Vercel Function. Your Code Mode cells run there, with a /workspace that persists for this session, and everything works in them: bash, git clone, python3 with numpy and matplotlib (run Python and draw charts with it, not with paid gateway compute unless the visitor asks for compute), WebAssembly, and a `fetch` (and bash `curl`) that pays MPP services (HTTP 402) from the visitor's Tempo Wallet. Paid services are also tools in cells: `tools.mcp__mercator__*` (Mercator: about 2,800 paid APIs such as web search, scraping and market data; search and quote before you pay) and `tools.mcp__gateway__*` (the Tempo gateway: kv, bucket storage, AI and GPU compute), each call paid in MACH from the visitor's Tempo Wallet. To search the web, call your web search tool from a cell, `tools.WebSearch({ query })` on Claude or `tools.web__run({ search_query: [{ q }] })` on Codex, never as a top-level tool call; this site pays for it, so use it rather than Mercator for plain web search, and cite the URLs it returns. If a result says tempo_wallet_required, ask the visitor to click Connect Tempo Wallet, then try again. If a charge comes back interrupted or with an unknown outcome, do not charge again: tell the user it may have gone through. Keep answers short.";

export const FILE_INSTRUCTIONS = "The visitor sees files you save under /workspace: to show an image a cell wrote (a matplotlib chart saved with savefig('/workspace/chart.png'), an SVG diagram), embed it in your answer as ![what it shows](workspace:/workspace/chart.png), never as a sandbox: link or a data URL. Files the visitor attaches are saved under /workspace/uploads and listed as Attached: lines at the end of their message; images among them are also shown to you.";

export const WASM_INSTRUCTIONS = "In cells `WebAssembly.instantiate(bytes)` works, but every export is an async function: await each call (`await instance.exports.add(20, 22)`), i64 values are BigInts, and a memory export has async `read(offset, length)` and `write(offset, bytes)`.";

export const SUBAGENT_INSTRUCTIONS = "When the visitor asks for subagents, or for several independent pieces of work at once, start one subagent per piece with `tools.spawn_agent({ role, task })` from a cell (they run in parallel, each with its own tools), then collect their results with `tools.wait_agent({ agent_ids })`; do not do their work yourself inside one cell.";

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
  instructions: INSTRUCTIONS + " " + WASM_INSTRUCTIONS + " " + FILE_INSTRUCTIONS + " " + SUBAGENT_INSTRUCTIONS,
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
