import { appendFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Miniflare } from "miniflare";

globalThis.document = {};
const dir = resolve("output", "vhand");
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
process.env.WORKFLOW_TARGET_WORLD = "local";
process.env.WORKFLOW_LOCAL_DATA_DIR = join(dir, "world");

writeFileSync(join(dir, "relay.js"), readFileSync("node_modules/nanocode-ts/dist/cloudflare/relay.js"));
writeFileSync(join(dir, "worker.js"), 'import { HandRelay, relay } from "./relay.js";\nexport { HandRelay };\nexport default { fetch(request, env) { return relay(request, env.HAND_RELAY) ?? new Response("not found", { status: 404 }); } };\n');
const mf = new Miniflare({ modules: [{ type: "ESModule", path: join(dir, "worker.js") }, { type: "ESModule", path: join(dir, "relay.js") }], compatibilityDate: "2026-08-01", durableObjects: { HAND_RELAY: "HandRelay" }, port: 8790, host: "127.0.0.1" });
const relayBase = String(await mf.ready).replace("http", "ws");

const [{ getWorld }, nanocode, { connectHand }, { Bash }] = await Promise.all([import("durable-harness"), import("nanocode-ts/vercel"), import("nanocode-ts"), import("nanocode-ts/bash")]);
await getWorld();

const cells = [
  "const r = await bash('echo hi from the tab; pwd'); text(r.stdout); const { instance } = await WebAssembly.instantiate(new Uint8Array([0,97,115,109,1,0,0,0,1,7,1,96,2,127,127,1,127,3,2,1,0,7,7,1,3,97,100,100,0,0,10,9,1,7,0,32,0,32,1,106,11])); text('wasm=' + await instance.exports.add(20, 22)); text('fetch=' + (await fetch('https://tab.example/x')).status); text(Object.keys(tools).join(','));",
  "store('k', 'kept'); text(await tools.tab_echo({ said: 'yo' }).then(JSON.stringify));",
  "text(load('k'));",
];
let n = 0;
const sse = events => new Response(events.map(([event, data]) => "event: " + event + "\ndata: " + JSON.stringify(data) + "\n\n").join(""), { headers: { "content-type": "text/event-stream" } });
const dispatch = async request => {
  const input = JSON.parse(new TextDecoder().decode(request.body));
  const last = input.messages.at(-1);
  const result = Array.isArray(last.content) ? last.content.find(block => block.type === "tool_result") : undefined;
  const done = result ? (typeof result.content === "string" ? result.content : result.content.map(b => b.text ?? "").join("\n")) : undefined;
  if (done === undefined) { n = 0; console.log("model tools:", input.tools.map(t => t.name).join(",")); }
  const code = done === undefined ? cells[0] : cells[++n];
  if (done !== undefined) console.log("cell result:\n" + done + "\n---");
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
  hands: { relay: channel => relayBase + "relay/" + channel + "/brain" },
  report: drive => { drives.push(drive); },
});
const channel = "ch" + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
const shell = await Bash.create({ cwd: "/workspace" });
const module = new WebAssembly.Module(readFileSync("node_modules/nanocode-ts/dist/nanocode_wasm.wasm"));
const hand = process.env.NOHAND ? { close() {} } : await connectHand(module, { url: relayBase + "relay/" + channel + "/hand", workspace: shell.workspace(), cwd: shell.cwd, fetch: async () => new Response("tab", { status: 207 }), tools: { definitions: [{ name: "tab_echo", description: "Echo in the tab.", parameters: { type: "object", properties: { said: { type: "string" } }, required: ["said"] } }], call: async (name, input) => ({ echoed: input.said }) } });
console.log("hand attached to relay");
const post = body => app.POST(new Request("http://localhost/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
const started = Date.now();
const sent = await post({ harness: "claude", model: "claude-haiku-5-5", effort: "low", hand: channel, text: "go" });
const reader = sent.body.getReader();
const dec = new TextDecoder();
let live = "";
const until = Date.now() + 40000;
for (;;) { const next = await Promise.race([reader.read(), new Promise(r => setTimeout(() => r({ done: true }), Math.max(0, until - Date.now())))]); if (next.done) break; live += dec.decode(next.value); if (live.includes('"idle"')) break; }
console.log("ms", Date.now() - started, "drives", JSON.stringify(drives.map(d => ({ outcome: d.outcome, error: d.error }))));
console.log("live has turn:", /"type":"turn"/.test(live));
hand.close();
await mf.dispose();
process.exit(0);

