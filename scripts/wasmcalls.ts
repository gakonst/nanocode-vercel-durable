import { appendFileSync, mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Gateway } from "nanocode-ts/vercel";

type Dispatch = Gateway.Dispatch;

const calls = Number(process.argv[2] ?? 100000);
const dir = resolve("output", "wasmcalls-" + calls);
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
process.env.WORKFLOW_LOCAL_DATA_DIR = join(dir, "world");

const ADD = "0,97,115,109,1,0,0,0,1,7,1,96,2,127,127,1,127,3,2,1,0,7,7,1,3,97,100,100,0,0,10,9,1,7,0,32,0,32,1,106,11";
const CELL = process.argv[3] ?? "const { instance } = await WebAssembly.instantiate(new Uint8Array([" + ADD + "]));\nlet sum = 0;\nfor (let i = 0; i < " + calls + "; i++) sum = await instance.exports.add(sum, 1);\ntext('sum ' + sum);";

const sse = (events: unknown[]) => new Response(events.map(data => "data: " + JSON.stringify(data) + "\n\n").join(""), { headers: { "content-type": "text/event-stream" } });

let n = 0;
const dispatch: Dispatch = async request => {
  const body = JSON.parse(new TextDecoder().decode(request.body));
  const items = body.input as { type: string; output?: unknown }[];
  const result = items.find(item => item.type === "custom_tool_call_output" || item.type === "function_call_output");
  const id = "resp_" + n++;
  appendFileSync(join(dir, "requests.jsonl"), JSON.stringify({ at: Date.now(), result: result ? JSON.stringify(result.output).slice(0, 400) : null }) + "\n");
  const item = result
    ? { type: "message", id: "msg_" + id, role: "assistant", status: "completed", content: [{ type: "output_text", text: "done" }] }
    : { type: "custom_tool_call", id: "ctc_" + id, call_id: "call_" + id, name: "exec", input: CELL, status: "completed" };
  return sse([
    { type: "response.created", response: { id, status: "in_progress" } },
    { type: "response.output_item.added", output_index: 0, item },
    { type: "response.output_item.done", output_index: 0, item },
    { type: "response.completed", response: { id, status: "completed", model: body.model, output: [item], usage: { input_tokens: 8, output_tokens: 4, total_tokens: 12 } } },
  ]);
};

const [{ durableAgent, getWorld, isSettled }, nanocode] = await Promise.all([import("durable-harness"), import("nanocode-ts/vercel")]);
const drives: unknown[] = [];
const agent = durableAgent({
  harness: nanocode.Harness.create({
    name: "nanocode-wasmcalls",
    provider: "codex",
    model: "gpt-6-luna",
    endpoint: nanocode.Gateway.endpoint("codex"),
    gateway: "vercel",
    durability: "on",
    dispatch,
    codeMode: true,
    report: report => drives.push(report),
  }),
  durability: "on",
  directDriveMs: 280_000,
});
const world = await getWorld();
const started = performance.now();
const { sessionId } = await agent.sessions.start();
const submission = await agent.sessions.send(sessionId, "Call a WebAssembly export " + calls + " times.");
let state;
for (;;) {
  state = await agent.sessions.inspect(sessionId);
  if (state.status === "failed") break;
  const batches = nanocode.Journal.committed(state).length;
  if (batches > 0 && isSettled(state, submission) && nanocode.Harness.isIdle(state, { batches: batches })) break;
  await new Promise(done => setTimeout(done, 200));
}
const reader = await nanocode.Reader.open(state);
const page = await reader.page(0, 1_000_000);
const turn = await reader.turn(submission);
await reader.close();
const types: Record<string, number> = {};
for (const event of page.events as { event?: { event?: { type?: string } } }[]) { const type = String((event as any).event?.event?.type ?? (event as any).event?.type); types[type] = (types[type] ?? 0) + 1; }
const batches = nanocode.Journal.committed(state);
console.log(JSON.stringify({ calls, status: state.status, failure: state.failure?.message, ms: Math.round(performance.now() - started), world_events: state.eventCount, steps: state.effectOrder.length, sql_batches: batches.length, sql_transactions: batches.flat().length, sql_bytes: JSON.stringify(batches).length, nanocode_events: page.events.length, event_types: types, result: JSON.stringify((turn as any)?.report?.ok ?? (turn as any)?.report).slice(0, 300), drives: drives.map((d: any) => ({ outcome: d.outcome, ms: Math.round(d.duration_ms), journal: d.journal })) }, null, 1));
await world.close?.();
process.exit(0);

