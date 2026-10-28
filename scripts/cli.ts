import { getWorld, isSettled } from "durable-harness";
import { agent } from "../lib/agent.ts";
import { Harness, Journal, Reader } from "nanocode-ts/vercel";

const args = process.argv.slice(2);
const resumed = args[0]?.startsWith("wrun_") ? args.shift() : undefined;
const prompt = args.join(" ");
if (!resumed && !prompt) {
  process.stderr.write("usage: npm run cli -- [<session id>] [prompt]\n");
  process.exit(2);
}

const world = await getWorld();
const sessionId = resumed ?? (await agent.sessions.start()).sessionId;
process.stderr.write(`session ${sessionId}\n`);
const stop = new AbortController();
const from = await agent.sessions.liveEnd(sessionId);
const submission = prompt ? await agent.sessions.send(sessionId, prompt) : undefined;

void (async () => {
  for await (const event of agent.sessions.live(sessionId, { startIndex: from, signal: stop.signal }) as AsyncIterable<{ type: string; delta?: string; name?: string; args?: unknown; status?: string; result?: string | { text?: string } }>) {
    if (event.type === "text") process.stdout.write(event.delta ?? "");
    else if (event.type === "reasoning") process.stdout.write(`\x1b[2m${event.delta ?? ""}\x1b[0m`);
    else if (event.type === "tool_start") process.stdout.write(`\n[${event.name}] ${JSON.stringify(event.args)}\n`);
    else if (event.type === "tool_end") process.stdout.write(`[${event.name} ${event.status}] ${typeof event.result === "string" ? event.result : event.result?.text ?? ""}\n`);
    else if (event.type === "turn") process.stdout.write(`\n[turn ${event.status}]\n`);
  }
})().catch(() => undefined);

try {
  for (;;) {
    const state = await agent.sessions.inspect(sessionId);
    if (state.status === "failed") throw new Error(`the session failed: ${state.failure?.message}`);
    const batches = Journal.committed(state).length;
    if (batches > 0 && isSettled(state, submission) && Harness.isIdle(state, { batches: batches })) {
      const reader = await Reader.open(state);
      const last = state.submissions.findLast(entry => entry.kind === "prompt");
      const turn = last ? await reader.turn(last.id) : null;
      await reader.close();
      process.stderr.write(`\n${JSON.stringify(turn?.report ?? null)}\n`);
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
} finally {
  stop.abort();
  await world.close?.();
  process.exit(process.exitCode ?? 0);
}
