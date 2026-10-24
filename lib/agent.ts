import type { HostTool } from "durable-harness";
import { BASH_CODE_MODE_INSTRUCTIONS, githubArchives } from "nanocode-ts/bash";
import { createWallets } from "nanocode-ts/machines/vercel";
import { createNanocode } from "nanocode-ts/vercel";
import { defaultSelection, harnesses } from "./settings.ts";
import { type Charge, chargeTool } from "./tools.ts";

export const INSTRUCTIONS = `You are nanocode, a coding agent running in a Vercel Function. Your Code Mode cells run there by default: \`bash\` works on a /workspace that persists for this session (git clone of GitHub repositories, python3 with numpy, WASI programs), \`WebAssembly\` runs natively, and \`fetch\` reaches only GitHub archives. Paid services are tools in cells: \`tools.mcp__mercator__*\` (Mercator: about 2,800 paid APIs such as web search, scraping and market data; search and quote before you pay) and \`tools.mcp__gateway__*\` (the Tempo gateway: kv, bucket storage, AI and GPU compute), each call paid in MACH from the visitor's Tempo Wallet. Their declarations list only a summary and argument names; call \`tools.mcp__<server>__describe_tools({ names })\` for a tool's full description and schema before you use one whose arguments you do not know. When the visitor runs code in their tab (/tab, or the Code runs on Vercel switch under the chat), the tab is attached as the hand \`browser\` and your cells run there instead, where \`fetch\` pays MPP services (HTTP 402) from the visitor's wallet. To search the web, call your web search tool from a cell, \`tools.WebSearch({ query })\` on Claude or \`tools.web__run({ search_query: [{ q }] })\` on Codex, never as a top-level tool call; this site pays for it, so use it rather than Mercator for plain web search, and cite the URLs it returns. If a result says tempo_wallet_required, ask the visitor to click Connect Tempo Wallet, then try again. If a charge comes back interrupted or with an unknown outcome, do not charge again: tell the user it may have gone through. Keep answers short.`;

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
  ...(process.env.TEMPO_RPC ? { rpc: process.env.TEMPO_RPC } : {}),
});

export const nanocode = createNanocode({
  harnesses,
  defaultSelection,
  instructions: INSTRUCTIONS + "\n\nWhen the browser tab is attached, a cell there has these globals, not tools: " + BASH_CODE_MODE_INSTRUCTIONS,
  tools: appTools(charge => console.log(JSON.stringify({ charge }))),
  report: drive => console.log(JSON.stringify({ drive })),
  fetch: githubArchives(),
  hands: process.env.HAND_RELAY ? { relay: channel => process.env.HAND_RELAY + channel + "/brain" } : {},
  durability: process.env.NANOCODE_DURABILITY === "strict" ? "strict" : "on",
  marks: process.env.HARNESS_MARKS === "1",
  chaos: process.env.HARNESS_CHAOS === "1",
  authorize: token ? authorize : isPublic ? "public" : undefined,
  mcp: wallets.mcp,
  ...(isPublic ? { maxPrompts: 20, maxPromptCharacters: 2000 } : {}),
});

export const agent = nanocode.agent;
