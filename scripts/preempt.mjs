import { appendFileSync, mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

const dir = resolve("output", "preempt");
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
process.env.WORKFLOW_TARGET_WORLD = "local";
process.env.WORKFLOW_LOCAL_DATA_DIR = join(dir, "world");

const LATENCY_MS = Number(process.env.WRITE_LATENCY_MS ?? 150);
const STREAM_MS = Number(process.env.STREAM_MS ?? 9000);
const DELTA_MS = Number(process.env.DELTA_MS ?? 60);
const lib = process.env.NANOCODE_TS ?? "nanocode-ts/vercel";

globalThis.__dhlog = (m, f) => appendFileSync(join(dir, "harness.log"), new Date().toISOString() + " " + m + " " + JSON.stringify(f ?? {}) + "\n");
const [{ getWorld }, nanocode] = await Promise.all([import("durable-harness"), import(lib)]);
const world = await getWorld();
const create = world.events.create.bind(world.events);
let writes = 0;
world.events.create = async (...args) => {
  writes++;
  await new Promise(r => setTimeout(r, LATENCY_MS));
  return create(...args);
};

const log = (message, fields) => appendFileSync(join(dir, "harness.log"), new Date().toISOString() + " " + message + " " + JSON.stringify(fields ?? {}) + "\n");
const drives = [];
let calls = 0;
const dispatch = async request => {
  const body = JSON.parse(new TextDecoder().decode(request.body));
  const id = "resp_" + calls++;
  const items = body.input;
  const answered = items.some(item => item.type === "function_call_output");
  const enc = new TextEncoder();
  const ev = data => enc.encode("data: " + JSON.stringify(data) + "\n\n");
  const msg = { type: "message", id: "msg_" + id, role: "assistant", status: "completed", content: [{ type: "output_text", text: "" }] };
  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(ev({ type: "response.created", response: { id, status: "in_progress" } }));
      controller.enqueue(ev({ type: "response.output_item.added", output_index: 0, item: { ...msg, status: "in_progress", content: [] } }));
      let text = "";
      const until = Date.now() + (answered ? 300 : STREAM_MS);
      while (Date.now() < until) {
        await new Promise(r => setTimeout(r, DELTA_MS));
        const delta = "word" + text.length + " ";
        text += delta;
        controller.enqueue(ev({ type: "response.output_text.delta", output_index: 0, item_id: msg.id, content_index: 0, delta }));
      }
      const item = { ...msg, content: [{ type: "output_text", text }] };
      controller.enqueue(ev({ type: "response.output_item.done", output_index: 0, item }));
      controller.enqueue(ev({ type: "response.completed", response: { id, status: "completed", model: body.model, output: [item], usage: { input_tokens: 8, output_tokens: 4, total_tokens: 12 } } }));
      controller.close();
    },
  });
  return new Response(stream, { headers: { "content-type": "text/event-stream" } });
};

const app = nanocode.createNanocode({
  harnesses: [{ id: "codex", label: "Codex", models: [{ id: "gpt-6-luna", label: "Luna", name: "Luna", efforts: ["low"], effort: "low" }] }],
  authorize: "public",
  dispatch,
  endpoint: nanocode.gatewayEndpoint("codex"),
  gateway: "vercel",
  report: drive => { drives.push(drive); appendFileSync(join(dir, "drives.jsonl"), JSON.stringify(drive) + "\n"); },
  ...(process.env.HLOG ? {} : {}),
});

const post = body => app.POST(new Request("http://localhost/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
const started = Date.now();
const warm = await post({ harness: "codex", model: "gpt-6-luna", effort: "low", warm: true });
const { sessionId } = await warm.json();
await new Promise(r => setTimeout(r, 500));
const sent = await post({ sessionId, text: "Write a long answer." });
const reader = sent.body.getReader();
const dec = new TextDecoder();
let live = "";
const liveUntil = Date.now() + Number(process.env.LIVE_MS ?? 30000);
for (;;) { const next = await Promise.race([reader.read(), new Promise(r => setTimeout(() => r({ done: true, timeout: true }), Math.max(0, liveUntil - Date.now())))]); if (next.done) break; live += dec.decode(next.value); }
for (let i = 0; i < Number(process.env.SETTLE_POLLS ?? 400); i++) {
  const state = await app.agent.sessions.inspect(sessionId);
  if (nanocode.isIdle(state, nanocode.committedBatches(state).length) && drives.some(d => d.outcome === "settled")) break;
  await new Promise(r => setTimeout(r, 100));
}
const state = await app.agent.sessions.inspect(sessionId);
const reader2 = await nanocode.openReader(state);
const turn = await reader2.turn(state.submissions.find(s => s.kind === "prompt").id);
await reader2.close();
console.log(JSON.stringify({ lib, LATENCY_MS, STREAM_MS, DELTA_MS, ms: Date.now() - started, writes, model_calls: calls, sessionId, epoch: state.epoch, drives: drives.map(d => ({ attempt: d.attempt, outcome: d.outcome, error: d.error, duration_ms: Math.round(d.duration_ms), batches: d.journal.batches, replayed: d.journal.replayed_batches, model_requests: d.model_requests })), interrupted: state.effectOrder.filter(e => e.error?.interrupted).map(e => e.key), recover: state.effectOrder.filter(e => e.name === "recover").length, turn: turn?.report?.status, live_bytes: live.length }, null, 1));
await world.close?.();
process.exit(0);

