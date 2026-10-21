import { appendFileSync } from "node:fs";
import type { Dispatch } from "nanocode-ts/vercel";

export type ScriptedRequest = {
  provider: "claude" | "codex";
  pid: number;
  endpoint: string;
  model: string;
  effort?: string;
  credential_free: boolean;
  items: number;
  tools: string[];
  prompt?: string;
  tool_result?: string;
  answer: string;
};

const CHARGE = { name: "charge", input: { amount: 42, memo: "order 1001" } };
const WORKSPACE = { name: "bash", input: { command: "echo durable > /workspace/note.txt && cat /workspace/note.txt" } };

function plan(prompt: string | undefined) {
  if (prompt?.includes("charge")) return CHARGE;
  if (prompt?.includes("workspace")) return WORKSPACE;
  return undefined;
}

const sse = (events: [string | null, unknown][]) => new Response(events.map(([event, data]) => (event ? `event: ${event}\n` : "") + `data: ${JSON.stringify(data)}\n\n`).join(""), { headers: { "content-type": "text/event-stream" } });

const text = (content: unknown): string => typeof content === "string" ? content : Array.isArray(content) ? content.map(part => typeof part === "string" ? part : (part as { text?: string }).text ?? "").join("") : "";

export function scriptedDispatch(provider: "claude" | "codex", log: string): Dispatch {
  let calls = 0;
  return async request => {
    const body = JSON.parse(new TextDecoder().decode(request.body));
    const call = `${process.pid}_${calls++}`;
    const credential_free = !request.headers.some(([name]) => ["authorization", "x-api-key"].includes(name.toLowerCase()));
    const effort = provider === "claude" ? body.output_config?.effort ?? (body.thinking?.type === "disabled" ? "none" : undefined) : body.reasoning?.effort;
    const record = (entry: Omit<ScriptedRequest, "provider" | "pid" | "endpoint" | "model" | "effort" | "credential_free">) => appendFileSync(log, `${JSON.stringify({ provider, pid: process.pid, endpoint: request.endpoint, model: body.model, effort, credential_free, ...entry })}\n`);
    if (provider === "claude") {
      const messages = body.messages as { role: string; content: unknown }[];
      const last = messages.at(-1)!;
      const result = Array.isArray(last.content) ? (last.content as { type: string; content?: unknown }[]).find(block => block.type === "tool_result") : undefined;
      const prompt = [...messages].reverse().map(message => message.role === "user" && Array.isArray(message.content) && (message.content as { type: string }[]).some(block => block.type === "tool_result") ? undefined : message.role === "user" ? text(message.content) : undefined).find(value => value !== undefined);
      const tool = result ? undefined : plan(prompt);
      const answer = result ? `The tool answered: ${text(result.content)}` : tool ? `tool_use ${tool.name}` : "ok";
      record({ items: messages.length, tools: (body.tools ?? []).map((tool: { name: string }) => tool.name), ...(prompt !== undefined ? { prompt } : {}), ...(result ? { tool_result: text(result.content) } : {}), answer });
      const block = tool
        ? [{ type: "tool_use", id: `toolu_${call}`, name: tool.name, input: {} }, { type: "input_json_delta", partial_json: JSON.stringify(tool.input) }]
        : [{ type: "text", text: "" }, { type: "text_delta", text: answer }];
      return sse([
        ["message_start", { type: "message_start", message: { id: `msg_${call}`, type: "message", role: "assistant", model: body.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 8, output_tokens: 0 } } }],
        ["content_block_start", { type: "content_block_start", index: 0, content_block: block[0] }],
        ["content_block_delta", { type: "content_block_delta", index: 0, delta: block[1] }],
        ["content_block_stop", { type: "content_block_stop", index: 0 }],
        ["message_delta", { type: "message_delta", delta: { stop_reason: tool ? "tool_use" : "end_turn", stop_sequence: null }, usage: { output_tokens: 4 } }],
        ["message_stop", { type: "message_stop" }],
      ]);
    }
    const items = body.input as { type: string; role?: string; content?: unknown; output?: unknown }[];
    const user = items.findLastIndex(item => item.type === "message" && item.role === "user");
    const result = items.find((item, index) => index > user && item.type === "function_call_output");
    const prompt = user >= 0 ? text(items[user].content) : undefined;
    const tool = result ? undefined : plan(prompt);
    const answer = result ? `The tool answered: ${text(result.output)}` : tool ? `function_call ${tool.name}` : "ok";
    const offered = (body.tools ?? items.flatMap(item => item.type === "additional_tools" ? (item as unknown as { tools: { name?: string }[] }).tools : [])).map((tool: { name?: string }) => tool.name ?? "");
    record({ items: items.length, tools: offered, ...(prompt !== undefined ? { prompt } : {}), ...(result ? { tool_result: text(result.output) } : {}), answer });
    const id = `resp_${call}`;
    const item = tool
      ? { type: "function_call", id: `fc_${call}`, call_id: `call_${call}`, name: tool.name, arguments: JSON.stringify(tool.input), status: "completed" }
      : { type: "message", id: `msg_${call}`, role: "assistant", status: "completed", content: [{ type: "output_text", text: answer }] };
    return sse([
      [null, { type: "response.created", response: { id, status: "in_progress" } }],
      [null, { type: "response.output_item.added", output_index: 0, item: item.type === "message" ? { ...item, status: "in_progress", content: [] } : item }],
      ...(item.type === "message" ? [[null, { type: "response.output_text.delta", output_index: 0, item_id: item.id, content_index: 0, delta: answer }] as [null, unknown]] : []),
      [null, { type: "response.output_item.done", output_index: 0, item }],
      [null, { type: "response.completed", response: { id, status: "completed", model: body.model, output: [item], usage: { input_tokens: 8, output_tokens: 4, total_tokens: 12 } } }],
    ]);
  };
}
