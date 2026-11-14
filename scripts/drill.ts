import { type ChildProcess, spawn } from "node:child_process";
import { appendFileSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Journal } from "nanocode-ts/vercel";

type Durability = Journal.Durability;
import type { ScriptedRequest } from "./scripted.ts";

type Provider = "claude" | "codex";

type Scenario = "charge" | "waiting";

const PROMPTS = { charge: "Please charge $42 for order 1001.", waiting: "Please wait three seconds, then charge $7.", workspace: "Use the workspace to write a note and read it back." };

const UNKNOWN = /outcome (is )?unknown|interrupted by a host crash/;


const MODELS: Record<Provider, string> = { claude: "claude-haiku-5-5", codex: "gpt-6-luna" };

const CHARGE_CONFIRM_MS = 3000;

const KILL_AFTER_CHARGE_MS = CHARGE_CONFIRM_MS / 2;

const paths = (dir: string) => ({ data: join(dir, "world"), ledger: join(dir, "ledger.jsonl"), requests: join(dir, "requests.jsonl"), drives: join(dir, "drives.jsonl") });

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const lines = <T>(path: string): T[] => {
  try { return readFileSync(path, "utf8").split("\n").filter(Boolean).map(line => JSON.parse(line) as T); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
};

const entries = (path: string): string[] => {
  try { return readdirSync(path); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
};

const committedSince = (data: string, since: number) => entries(join(data, "events")).some(run => entries(join(data, "events", run)).filter(file => file.endsWith(".json")).some(file => {
  const event = JSON.parse(readFileSync(join(data, "events", run, file), "utf8")) as { eventType: string; createdAt: string; eventData?: { stepName?: string } };
  return event.eventType === "step_completed" && event.eventData?.stepName?.endsWith("nanocode.sql") === true && Date.parse(event.createdAt) >= since;
}));

const args = process.argv.slice(2);
if (args[0] === "child") await child(args[1] as "start" | "resume", args[2] as Scenario, args[3] as Provider, args[4] as Durability, args[5], args[6]);
else await orchestrate((args[0] ?? "claude,codex").split(",") as Provider[], (args[1] ?? "on,strict").split(",") as Durability[], (args[2] ?? "charge,waiting").split(",") as Scenario[]);

async function child(phase: "start" | "resume", scenario: Scenario, provider: Provider, durability: Durability, dir: string, resumed?: string): Promise<void> {
  const files = paths(dir);
  process.env.WORKFLOW_LOCAL_DATA_DIR = files.data;
  process.env.CHARGE_CONFIRM_MS = String(CHARGE_CONFIRM_MS);
  const [{ durableAgent, getWorld, isSettled }, nanocode, { scriptedDispatch }, { appTools }] = await Promise.all([
    import("durable-harness"),
    import("nanocode-ts/vercel"),
    import("./scripted.ts"),
    import("../lib/agent.ts"),
  ]);
  const agent = durableAgent({
    harness: nanocode.Harness.create({
      name: "nanocode-drill",
      codeMode: scenario === "waiting",
      provider,
      model: MODELS[provider],
      endpoint: nanocode.Gateway.endpoint(provider),
      ...(provider === "codex" ? { gateway: "vercel" as const } : {}),
      durability,
      dispatch: scriptedDispatch(provider, files.requests),
      tools: appTools(charge => appendFileSync(files.ledger, `${JSON.stringify(charge)}\n`)),
      report: report => appendFileSync(files.drives, `${JSON.stringify({ pid: process.pid, phase, ...report })}\n`),
    }),
    durability,
    ...(process.env.DRILL_LOG ? { log: (message: string, fields?: Record<string, unknown>) => process.stderr.write(`${new Date().toISOString()} [${phase}] ${message} ${JSON.stringify(fields ?? {})}\n`) } : {}),
  });
  const world = await getWorld();
  if (phase === "start") {
    const { sessionId } = await agent.sessions.start();
    process.stdout.write(`${JSON.stringify({ sessionId })}\n`);
    await agent.sessions.send(sessionId, PROMPTS[scenario]);
    await new Promise(() => undefined);
  }
  const sessionId = resumed!;
  const settled = async (submission?: string) => {
    for (;;) {
      const state = await agent.sessions.inspect(sessionId);
      if (state.status === "failed") throw new Error(`the session failed: ${state.failure?.message}`);
      const batches = nanocode.Journal.committed(state).length;
      if (batches > 0 && isSettled(state, submission) && nanocode.Harness.isIdle(state, { batches: batches })) return state;
      await sleep(50);
    }
  };
  const resumedAt = performance.now();
  const recovered = await settled();
  const recovery_ms = performance.now() - resumedAt;
  const recoveredEvents = recovered.eventCount;
  const sentAt = performance.now();
  const state = scenario === "charge" ? await settled(await agent.sessions.send(sessionId, PROMPTS.workspace)) : recovered;
  const turn_ms = performance.now() - sentAt;
  const reader = await nanocode.Reader.open(state);
  const turns = [];
  for (const placed of state.submissions.filter(entry => entry.kind === "prompt")) turns.push({ submission: placed.id, text: placed.text, turn: await reader.turn(placed.id) });
  const page = await reader.page(0, 1000);
  await reader.close();
  const operations: Record<string, number> = {};
  for (const transaction of nanocode.Journal.committed(state).flat()) operations[`${transaction.kind}.${transaction.operation}`] = (operations[`${transaction.kind}.${transaction.operation}`] ?? 0) + 1;
  const effects = state.effectOrder.map(effect => ({ key: effect.key, name: effect.name, status: effect.status, attempt: effect.attempt, ...(effect.error?.interrupted ? { interrupted: true } : {}) }));
  process.stdout.write(`${JSON.stringify({ sessionId, recovery_ms, turn_ms, events_after_recovery: recoveredEvents, events: state.eventCount, sql_batches: nanocode.Journal.committed(state).length, sql_transactions: nanocode.Journal.committed(state).flat().length, sql_operations: operations, nanocode_events: page.events.length, effects, turns })}\n`);
  await world.close?.();
  process.exit(0);
}

function launch(args: string[]): ChildProcess {
  return spawn(process.execPath, ["--disable-warning=ExperimentalWarning", fileURLToPath(import.meta.url), "child", ...args], { stdio: ["ignore", "pipe", "inherit"] });
}

function firstLine(process: ChildProcess): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffered = "";
    process.stdout!.on("data", chunk => {
      buffered += chunk;
      const end = buffered.indexOf("\n");
      if (end >= 0) resolve(buffered.slice(0, end));
    });
    process.on("exit", code => reject(new Error(`child exited with ${code} before writing a line`)));
  });
}

function exited(process: ChildProcess): Promise<void> {
  return new Promise(resolve => process.exitCode !== null || process.signalCode !== null ? resolve() : process.on("exit", () => resolve()));
}

function check(condition: unknown, message: string): void {
  if (!condition) throw new Error(`drill: ${message}`);
}

async function orchestrate(providers: Provider[], durabilities: Durability[], scenarios: Scenario[]): Promise<void> {
  const results = [];
  const failures: string[] = [];
  for (const scenario of scenarios) for (const provider of providers) for (const durability of durabilities) {
    const dir = resolve("output", scenario === "charge" ? `drill-${provider}-${durability}` : `drill-${scenario}-${provider}-${durability}`);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    const files = paths(dir);
    const startedAt = performance.now();
    const first = launch(["start", scenario, provider, durability, dir]);
    const { sessionId } = JSON.parse(await firstLine(first)) as { sessionId: string };
    if (scenario === "charge") {
      while (lines(files.ledger).length === 0) await sleep(10);
    } else {
      while (lines(files.requests).length === 0) await sleep(10);
      const asked = lines<ScriptedRequest>(files.requests)[0]!.at;
      while (!committedSince(files.data, asked)) await sleep(10);
    }
    const charged_ms = performance.now() - startedAt;
    if (scenario === "charge") await sleep(KILL_AFTER_CHARGE_MS);
    first.kill("SIGKILL");
    await exited(first);
    const second = launch(["resume", scenario, provider, durability, dir, sessionId]);
    const summary = JSON.parse(await firstLine(second));
    await exited(second);
    const requests = lines<ScriptedRequest>(files.requests);
    const killed = requests.filter(request => request.pid === first.pid);
    const after = requests.filter(request => request.pid === second.pid);
    const charges = lines(files.ledger);
    if (scenario === "waiting") {
      const answered = after.findLast(request => request.tool_result !== undefined)?.tool_result ?? "";
      const unknown = after.find(request => UNKNOWN.test(request.tool_result ?? ""))?.tool_result;
      const status = summary.turns[0]?.turn?.report.status;
      const found = [
        killed.length !== 1 && `the killed drive made ${killed.length} model requests`,
        after[0]?.tool_result === undefined && "the recovered drive asked the model for the cell again, so the cell's model receipt was lost",
        charges.length !== 1 && `${charges.length} charges in the ledger`,
        status !== "completed" && `the turn ended ${status}`,
        unknown !== undefined && `the cell had made no tool call when the drive was killed, yet the model was told: ${unknown.slice(0, 200)}`,
        !answered.includes("charged $7.00") && "the model never got the charge's result",
      ].filter((failure): failure is string => typeof failure === "string").map(failure => `waiting ${provider} ${durability}: ${failure}`);
      failures.push(...found);
      const result = { scenario, provider, durability, node: process.version, measured_at: new Date().toISOString(), session: sessionId, killed_ms: charged_ms, recovery_ms: summary.recovery_ms, charges: charges.length, waits: after.filter(request => request.answer.endsWith(" wait")).length, tool_result_after_crash: answered, turn: summary.turns[0]?.turn?.report, failures: found };
      writeFileSync(join(dir, "report.json"), `${JSON.stringify({ ...result, effects: summary.effects, requests }, null, 2)}\n`);
      results.push(result);
      continue;
    }
    try {
    const [chargeTurn, workspaceTurn] = summary.turns;
    const chargeStep = summary.effects.find((effect: { name: string }) => effect.name === "tool.charge");
    check(charges.length === 1, `${charges.length} charges in the ledger`);
    check(killed.length === 1 && killed[0].answer.endsWith("charge"), "the killed drive made one model request, which asked for the charge");
    check(after[0]?.tool_result !== undefined && !after[0].tool_result.includes("charged $42"), "the recovered drive's first request answers the charge without its result");
    check(after.length === 3, `the recovered drive made ${after.length} model requests instead of 3`);
    check(chargeStep?.status === "failed" && chargeStep.interrupted, "the charge step is recorded as interrupted");
    check(chargeTurn?.turn?.report.status === "completed" && workspaceTurn?.turn?.report.status === "completed", "both turns completed");
    check(JSON.stringify(workspaceTurn.turn.report).includes("durable"), "the workspace turn read the note back");
    check(requests.every(request => request.credential_free), "nanocode sent no credential");
    check(requests.every(request => request.model === (provider === "codex" ? `openai/${MODELS.codex}` : MODELS.claude)), "requests name the gateway's model ID");
    check(after.at(-1)!.items > after[0].items, "the second turn replays the first turn's history");
    const result = {
      provider,
      durability,
      node: process.version,
      measured_at: new Date().toISOString(),
      session: sessionId,
      charged_ms,
      recovery_ms: summary.recovery_ms,
      second_turn_ms: summary.turn_ms,
      killed_requests: killed.length,
      recovered_requests: after.length,
      tool_result_after_crash: after[0].tool_result,
      charge_turn_message: chargeTurn.turn.report.ok?.message ?? chargeTurn.turn.report,
      workspace_turn_message: workspaceTurn.turn.report.ok?.message ?? workspaceTurn.turn.report,
      world_events: summary.events,
      world_events_after_recovery: summary.events_after_recovery,
      sql_batches: summary.sql_batches,
      sql_transactions: summary.sql_transactions,
      sql_operations: summary.sql_operations,
      nanocode_events: summary.nanocode_events,
      steps: Object.entries(summary.effects.reduce((counts: Record<string, number>, effect: { name: string }) => ({ ...counts, [effect.name]: (counts[effect.name] ?? 0) + 1 }), {})),
      drives: lines(files.drives),
    };
    writeFileSync(join(dir, "report.json"), `${JSON.stringify({ ...result, effects: summary.effects, requests }, null, 2)}\n`);
    results.push(result);
    } catch (error) {
      failures.push(`charge ${provider} ${durability}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  console.log(JSON.stringify(results, null, 2));
  if (failures.length) {
    console.error(failures.join("\n"));
    process.exitCode = 1;
  }
}
