import { durableAgent, type HostTool, virtual } from "durable-harness";
import { workspaceInstructions, workspaceTools } from "durable-harness/tools";
import { nanocodeHarness } from "nanocode-ts/vercel";
import { isPublic, MAX_PROMPTS_PER_SESSION } from "./authorize.ts";
import { defaultSelection } from "./settings.ts";
import { type Charge, chargeTool } from "./tools.ts";

export const workspace = virtual();

export const INSTRUCTIONS = `You are nanocode, a coding agent running in a Vercel Function. ${workspaceInstructions(workspace)} If a charge comes back interrupted or with an unknown outcome, do not charge again: tell the user it may have gone through. Keep answers short.`;

export const appTools = (record: (charge: Charge) => Promise<void> | void): HostTool[] => [...workspaceTools(workspace), chargeTool(record)];

const offline: typeof fetch = async () => {
  throw new Error("this deployment gives Code Mode scripts no network access");
};

export const durability = process.env.NANOCODE_DURABILITY === "strict" ? "strict" : "on";

export const agent = durableAgent({
  harness: nanocodeHarness({
    provider: defaultSelection.provider,
    model: defaultSelection.model,
    thinking: defaultSelection.thinking,
    instructions: INSTRUCTIONS,
    durability,
    tools: appTools(charge => console.log(JSON.stringify({ charge }))),
    report: drive => console.log(JSON.stringify({ drive })),
    subagents: false,
    streamToolInput: true,
    codeMode: true,
    fetch: offline,
    ...(isPublic ? { maxPrompts: MAX_PROMPTS_PER_SESSION } : {}),
  }),
  durability,
  marks: process.env.HARNESS_MARKS === "1",
});
