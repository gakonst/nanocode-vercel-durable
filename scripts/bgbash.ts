import { mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Gateway } from "nanocode-ts/vercel";

type Dispatch = Gateway.Dispatch;

const mode = process.argv[2] ?? "direct";
const dir = resolve("output", "bgbash-" + mode);
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
process.env.WORKFLOW_LOCAL_DATA_DIR = join(dir, "world");

const CELL = "const started = await tools.Bash({ command: 'sleep 2; echo bg-done; date +%s', run_in_background: true });\ntext(JSON.stringify(started));\nconst id = started.task_id;\ntext(JSON.stringify(await tools.TaskOutput({ task_id: id, block: false })));\ntext(JSON.stringify(await tools.TaskOutput({ task_id: id, block: true, timeout: 10000 })));\nconst slow = await tools.Bash({ command: 'sleep 30; echo never', run_in_background: true });\nconst slowId = slow.task_id;\ntext(JSON.stringify(await tools.TaskStop({ task_id: slowId })));\ntext(JSON.stringify(await tools.TaskOutput({ task_id: slowId, block: false })));";

const steps = mode === "cell"
  ? [{ name: "exec", input: { code: CELL } }]
  : [
      { name: "Bash", input: { command: "sleep 2; echo bg-done; date +%s", run_in_background: true, description: "slow echo" } },
      { name: "TaskOutput", input: { task_id: "bash-1", block: false } },
      { name: "TaskOutput", input: { task_id: "bash-1", block: true, timeout: 10000 } },
      { name: "Bash", input: { command: "sleep 30; echo never", run_in_background: true } },
      { name: "TaskStop", input: { task_id: "bash-2" } },
      { name: "TaskOutput", input: { task_id: "bash-2", block: false } },
    ];

const sse = (events: [string, unknown][]) => new Response(events.map(([event, data]) => "event: " + event + "\ndata: " + JSON.stringify(data) + "\n\n").join(""), { headers: { "content-type": "text/event-stream" } });
const transcript: unknown[] = [];
let n = 0;
const dispatch: Dispatch = async request => {
  const body = JSON.parse(new TextDecoder().decode(request.body));
  const messages = body.messages as { role: string; content: unknown }[];
  const results = messages.flatMap(message => Array.isArray(message.content) ? (message.content as { type: string; content?: unknown }[]).filter(block => block.type === "tool_result") : []);
  const last = results.at(-1);
  if (last) transcript.push({ at: Date.now(), result: last.content });
  if (n === 0) transcript.push({ tools: (body.tools ?? []).map((tool: { name: string }) => tool.name) });
  const step = steps[results.length];
  const id = "msg_" + n++;
  const block = step
    ? [{ type: "tool_use", id: "toolu_" + id, name: step.name, input: {} }, { type: "input_json_delta", partial_json: JSON.stringify(step.input) }]
    : [{ type: "text", text: "" }, { type: "text_delta", text: "done" }];
  return sse([
    ["message_start", { type: "message_start", message: { id, type: "message", role: "assistant", model: body.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 8, output_tokens: 0 } } }],
    ["content_block_start", { type: "content_block_start", index: 0, content_block: block[0] }],
    ["content_block_delta", { type: "content_block_delta", index: 0, delta: block[1] }],
    ["content_block_stop", { type: "content_block_stop", index: 0 }],
    ["message_delta", { type: "message_delta", delta: { stop_reason: step ? "tool_use" : "end_turn", stop_sequence: null }, usage: { output_tokens: 4 } }],
    ["message_stop", { type: "message_stop" }],
  ]);
};

const [{ durableAgent, getWorld, isSettled }, nanocode] = await Promise.all([import("durable-harness"), import("nanocode-ts/vercel")]);
const agent = durableAgent({
  harness: nanocode.Harness.create({ name: "nanocode-bgbash", provider: "claude", model: "claude-haiku-5-5", endpoint: nanocode.Gateway.endpoint("claude"), durability: "on", dispatch, codeMode: mode === "cell" }),
  durability: "on",
  directDriveMs: 280_000,
});
const world = await getWorld();
const started = performance.now();
const { sessionId } = await agent.sessions.start();
const submission = await agent.sessions.send(sessionId, "Run a background command.");
let state;
for (;;) {
  state = await agent.sessions.inspect(sessionId);
  if (state.status === "failed") break;
  const batches = nanocode.Journal.committed(state).length;
  if (batches > 0 && isSettled(state, submission) && nanocode.Harness.isIdle(state, { batches: batches })) break;
  await new Promise(done => setTimeout(done, 200));
}
console.log(JSON.stringify({ mode, ms: Math.round(performance.now() - started), status: state.status, failure: state.failure?.message, transcript }, null, 1));
await world.close?.();
process.exit(0);

