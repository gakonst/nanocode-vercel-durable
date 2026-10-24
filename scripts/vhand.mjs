import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { join, resolve } from "node:path";
import { Readable } from "node:stream";

globalThis.document = {};
const dir = resolve("output", "vhand");
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
process.env.WORKFLOW_TARGET_WORLD = "local";
process.env.WORKFLOW_LOCAL_DATA_DIR = join(dir, "world");

const [{ getWorld }, nanocode, { connectHand }, { Bash }] = await Promise.all([import("durable-harness"), import("nanocode-ts/vercel"), import("nanocode-ts"), import("nanocode-ts/bash")]);
await getWorld();

const cells = [
  "const r = await bash('echo hi from the tab; pwd'); text(r.stdout); const { instance } = await WebAssembly.instantiate(new Uint8Array([0,97,115,109,1,0,0,0,1,7,1,96,2,127,127,1,127,3,2,1,0,7,7,1,3,97,100,100,0,0,10,9,1,7,0,32,0,32,1,106,11])); text('wasm=' + await instance.exports.add(20, 22)); text('fetch=' + (await fetch('https://tab.example/x')).status); text(Object.keys(tools).join(','));",
  "store('k', 'kept'); text(await tools.tab_echo({ said: 'yo' }).then(JSON.stringify));",
  "text(load('k'));",
];
let n = 0;
const results = [];
const sse = events => new Response(events.map(([event, data]) => "event: " + event + "\ndata: " + JSON.stringify(data) + "\n\n").join(""), { headers: { "content-type": "text/event-stream" } });
const dispatch = async request => {
  const input = JSON.parse(new TextDecoder().decode(request.body));
  const last = input.messages.at(-1);
  const result = Array.isArray(last.content) ? last.content.find(block => block.type === "tool_result") : undefined;
  const done = result ? (typeof result.content === "string" ? result.content : result.content.map(b => b.text ?? "").join("\n")) : undefined;
  if (done === undefined) { n = 0; console.log("model tools:", input.tools.map(t => t.name).join(",")); }
  const code = done === undefined ? cells[0] : cells[++n];
  if (done !== undefined) { results.push(done); console.log("cell result:\n" + done + "\n---"); }
  const block = code !== undefined ? [{ type: "tool_use", id: "toolu_" + n + "_" + Date.now(), name: "exec", input: {} }, { type: "input_json_delta", partial_json: JSON.stringify({ code }) }] : [{ type: "text", text: "" }, { type: "text_delta", text: "done" }];
  return sse([
    ["message_start", { type: "message_start", message: { id: "m" + n, type: "message", role: "assistant", model: input.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 8, output_tokens: 0 } } }],
    ["content_block_start", { type: "content_block_start", index: 0, content_block: block[0] }],
    ["content_block_delta", { type: "content_block_delta", index: 0, delta: block[1] }],
    ["content_block_stop", { type: "content_block_stop", index: 0 }],
    ["message_delta", { type: "message_delta", delta: { stop_reason: code !== undefined ? "tool_use" : "end_turn", stop_sequence: null }, usage: { output_tokens: 4 } }],
    ["message_stop", { type: "message_stop" }],
  ]);
};
const drives = [];
const app = nanocode.createNanocode({
  harnesses: [{ id: "claude", label: "Claude", models: [{ id: "claude-haiku-5-5", label: "Haiku", name: "Haiku", efforts: ["low"], effort: "low" }] }],
  authorize: "public",
  dispatch,
  endpoint: nanocode.gatewayEndpoint("claude"),
  gateway: "vercel",
  report: drive => { drives.push(drive); },
});

const server = createServer(async (req, res) => {
  const controller = new AbortController();
  res.on("close", () => controller.abort());
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const request = new Request("http://127.0.0.1" + req.url, { method: req.method, headers: req.headers, signal: controller.signal, ...(req.method === "POST" ? { body: Buffer.concat(chunks) } : {}) });
  const response = await (req.method === "POST" ? app.POST(request) : app.GET(request));
  res.writeHead(response.status, Object.fromEntries(response.headers));
  if (response.body) Readable.fromWeb(response.body).on("error", () => res.end()).pipe(res);
  else res.end();
});
await new Promise(done => server.listen(0, "127.0.0.1", done));
const base = "http://127.0.0.1:" + server.address().port + "/api/chat";

const post = body => fetch(base, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const channel = "ch" + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
const { sessionId } = await (await post({ harness: "claude", model: "claude-haiku-5-5", effort: "low", hand: channel, warm: true })).json();
console.log("session", sessionId);

const refused = await fetch(base + "?sessionId=" + sessionId + "&hand=" + "x".repeat(20), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ connection: "c".repeat(16), catalog: "{}" }) });
console.log("wrong channel:", refused.status);

const shell = await Bash.create({ cwd: "/workspace" });
const module = new WebAssembly.Module(readFileSync("node_modules/nanocode-ts/dist/nanocode_wasm.wasm"));
const hand = process.env.NOHAND ? { close() {} } : await connectHand(module, { transport: "stream", url: base + "?sessionId=" + sessionId + "&hand=" + channel, workspace: shell.workspace(), cwd: shell.cwd, fetch: async () => new Response("tab", { status: 207 }), tools: { definitions: [{ name: "tab_echo", description: "Echo in the tab.", parameters: { type: "object", properties: { said: { type: "string" } }, required: ["said"] } }], call: async (name, input) => ({ echoed: input.said }) } });
console.log("hand attached over world streams");

const turns = [];
for (const text of ["go", "again"]) {
  const started = Date.now();
  const sent = await post({ sessionId, text });
  const reader = sent.body.getReader();
  const dec = new TextDecoder();
  let live = "";
  const until = Date.now() + 40000;
  for (;;) { const next = await Promise.race([reader.read(), new Promise(r => setTimeout(() => r({ done: true }), Math.max(0, until - Date.now())))]); if (next.done) break; live += dec.decode(next.value); if (live.includes('"idle"')) break; }
  turns.push({ ms: Date.now() - started, turn: /"type":"turn"/.test(live) });
}
console.log("turns", JSON.stringify(turns), "drives", JSON.stringify(drives.map(d => ({ outcome: d.outcome, error: d.error }))));
const joined = results.join("\n");
const checks = process.env.NOHAND ? { bash_on_vercel: /hi from the tab/.test(joined) && !/fetch=207/.test(joined), settled: drives.filter(d => d.outcome === "settled").length === 2 } : { bash: /hi from the tab/.test(joined), wasm: /wasm=42/.test(joined), fetch: /fetch=207/.test(joined), tool: /tab_echo/.test(joined) && /"echoed":"yo"/.test(joined), store_load: /kept/.test(joined), settled: drives.filter(d => d.outcome === "settled").length === 2 && results.filter(r => /fetch=207/.test(r)).length === 2 && turns.every(t => t.turn) };
console.log("checks", JSON.stringify(checks));
hand.close();
server.close();
process.exit(Object.values(checks).every(Boolean) ? 0 : 1);
