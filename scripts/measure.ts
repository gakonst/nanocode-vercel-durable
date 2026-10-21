import { mkdirSync, writeFileSync } from "node:fs";

type Turn = { prompt: string; headers_ms: number; first_event_ms: number | null; first_text_ms: number | null; turn_ms: number | null; idle_ms: number | null; end_ms: number | null; events: number; status?: string; timeline: { at: number; type: string; name?: string; t?: number }[] };

const PROMPTS = [
  "Say ok.",
  "Use bash to write durable to /workspace/note.txt, then read it back with read_file. Answer in one line.",
  "Say done.",
];

const TURN_TIMEOUT_MS = 120_000;

const [target, roundsArgument = "3"] = process.argv.slice(2);
if (!target) {
  process.stderr.write("usage: node scripts/measure.ts <deployment url> [rounds]\n");
  process.exit(2);
}
const rounds = Number(roundsArgument);
const headers: Record<string, string> = {
  "content-type": "application/json",
  ...(process.env.CHAT_TOKEN ? { authorization: `Bearer ${process.env.CHAT_TOKEN}` } : {}),
  ...(process.env.VERCEL_AUTOMATION_BYPASS_SECRET ? { "x-vercel-protection-bypass": process.env.VERCEL_AUTOMATION_BYPASS_SECRET } : {}),
};

async function turn(sessionId: string | undefined, prompt: string): Promise<{ turn: Turn; sessionId: string }> {
  const started = performance.now();
  const at = () => performance.now() - started;
  const response = await fetch(`${target.replace(/\/$/, "")}/api/chat`, { method: "POST", headers, body: JSON.stringify({ sessionId, text: prompt }), signal: AbortSignal.timeout(TURN_TIMEOUT_MS) });
  if (!response.ok || !response.body) throw new Error(`${response.status} ${await response.text()}`);
  const result: Turn = { prompt, headers_ms: at(), first_event_ms: null, first_text_ms: null, turn_ms: null, idle_ms: null, end_ms: null, events: 0, timeline: [] };
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffered = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffered += value;
    let end: number;
    while ((end = buffered.indexOf("\n\n")) >= 0) {
      const block = buffered.slice(0, end);
      buffered = buffered.slice(end + 2);
      if (/^event: end$/m.test(block)) result.end_ms = at();
      const data = block.split("\n").filter(line => line.startsWith("data:")).map(line => line.slice(5).trim()).join("");
      if (!data || data === "{}") continue;
      const event = JSON.parse(data) as { type: string; status?: string; name?: string; t?: number };
      result.events++;
      result.timeline.push({ at: Math.round(at()), type: event.type, ...(event.name ? { name: event.name } : {}), ...(event.t ? { t: Math.round(event.t) } : {}) });
      result.first_event_ms ??= at();
      if (event.type === "text") result.first_text_ms ??= at();
      if (event.type === "idle") result.idle_ms ??= at();
      if (event.type === "turn") {
        result.turn_ms = at();
        result.status = event.status;
      }
    }
  }
  return { turn: result, sessionId: response.headers.get("x-session-id") ?? sessionId ?? "" };
}

const median = (values: number[]) => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  return sorted.length ? Math.round(sorted[Math.floor(sorted.length / 2)]) : null;
};

const sessions: { sessionId: string | undefined; turns: Turn[] }[] = [];
for (let round = 0; round < rounds; round++) {
  let sessionId: string | undefined;
  const turns: Turn[] = [];
  for (const prompt of PROMPTS) {
    const done = await turn(sessionId, prompt);
    sessionId = done.sessionId;
    turns.push(done.turn);
  }
  sessions.push({ sessionId, turns });
}
const summary = PROMPTS.map((prompt, index) => {
  const turns = sessions.map(session => session.turns[index]);
  return {
    prompt,
    statuses: turns.map(entry => entry.status),
    headers_ms: median(turns.map(entry => entry.headers_ms)),
    first_text_ms: median(turns.map(entry => entry.first_text_ms ?? Number.NaN)),
    turn_ms: median(turns.map(entry => entry.turn_ms ?? Number.NaN)),
    idle_ms: median(turns.map(entry => entry.idle_ms ?? Number.NaN)),
    end_ms: median(turns.map(entry => entry.end_ms ?? Number.NaN)),
  };
});
const report = { target, measured_at: new Date().toISOString(), rounds, summary, sessions };
mkdirSync("output", { recursive: true });
const path = `output/measure-${Date.now()}.json`;
writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ target, summary }, null, 2));
console.log("report", path);
