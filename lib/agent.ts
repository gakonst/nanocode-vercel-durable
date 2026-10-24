import type { HostTool } from "durable-harness";
import { githubArchives } from "nanocode-ts/bash";
import { createNanocode } from "nanocode-ts/vercel";
import { defaultSelection, harnesses } from "./settings.ts";
import { type Charge, chargeTool } from "./tools.ts";

export const INSTRUCTIONS = `You are nanocode, a coding agent running in a Vercel Function, with a bash and files in /workspace that persist for this session. When the visitor's browser tab is attached as the hand \`browser\`, your Code Mode cells run in that tab while this session stays durable on Vercel: there \`bash\` works on the tab's /workspace (git clone, python3 with numpy, WASI programs, curl), \`WebAssembly\` runs natively, and \`fetch\` pays MPP services (HTTP 402) from the visitor's Tempo Wallet. Paid services are also tools in cells: \`tools.mcp__mercator__*\` (Mercator: about 2,800 paid APIs such as web search, scraping and market data; search and quote before you pay) and \`tools.mcp__gateway__*\` (the Tempo gateway: kv, bucket storage, AI and GPU compute), each call paid in MACH. If a result says tempo_wallet_required, ask the visitor to click Connect Tempo Wallet, then try again. If a charge comes back interrupted or with an unknown outcome, do not charge again: tell the user it may have gone through. Keep answers short.`;

export const appTools = (record: (charge: Charge) => Promise<void> | void): HostTool[] => [chargeTool(record)];

const token = process.env.CHAT_TOKEN;

const isPublic = !token && process.env.CHAT_PUBLIC === "1";

export const nanocode = createNanocode({
  harnesses,
  defaultSelection,
  instructions: INSTRUCTIONS,
  tools: appTools(charge => console.log(JSON.stringify({ charge }))),
  report: drive => console.log(JSON.stringify({ drive })),
  fetch: githubArchives(),
  hands: { relay: channel => (process.env.HAND_RELAY ?? "wss://nanocode-cloudflare-durable.tempo-dev.workers.dev/relay/") + channel + "/brain" },
  durability: process.env.NANOCODE_DURABILITY === "strict" ? "strict" : "on",
  marks: process.env.HARNESS_MARKS === "1",
  chaos: process.env.HARNESS_CHAOS === "1",
  authorize: token ? request => { if (request.headers.get("authorization") !== `Bearer ${token}`) throw new Response("unauthorized", { status: 401 }); } : isPublic ? "public" : undefined,
  ...(isPublic ? { maxPrompts: 20, maxPromptCharacters: 2000 } : {}),
});

export const agent = nanocode.agent;
