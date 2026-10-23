import type { HostTool } from "durable-harness";
import { createNanocode } from "nanocode-ts/vercel";
import { defaultSelection, harnesses } from "./settings.ts";
import { type Charge, chargeTool } from "./tools.ts";

export const INSTRUCTIONS = `You are nanocode, a coding agent running in a Vercel Function, with a bash and files in /workspace that persist for this session. If a charge comes back interrupted or with an unknown outcome, do not charge again: tell the user it may have gone through. Keep answers short.`;

export const appTools = (record: (charge: Charge) => Promise<void> | void): HostTool[] => [chargeTool(record)];

const token = process.env.CHAT_TOKEN;

const isPublic = !token && process.env.CHAT_PUBLIC === "1";

export const nanocode = createNanocode({
  harnesses,
  defaultSelection,
  instructions: INSTRUCTIONS,
  tools: appTools(charge => console.log(JSON.stringify({ charge }))),
  report: drive => console.log(JSON.stringify({ drive })),
  fetch: async () => { throw new Error("this deployment gives Code Mode scripts no network access"); },
  durability: process.env.NANOCODE_DURABILITY === "strict" ? "strict" : "on",
  marks: process.env.HARNESS_MARKS === "1",
  chaos: process.env.HARNESS_CHAOS === "1",
  authorize: token ? request => { if (request.headers.get("authorization") !== `Bearer ${token}`) throw new Response("unauthorized", { status: 401 }); } : isPublic ? "public" : undefined,
  ...(isPublic ? { maxPrompts: 20, maxPromptCharacters: 2000 } : {}),
});

export const agent = nanocode.agent;
