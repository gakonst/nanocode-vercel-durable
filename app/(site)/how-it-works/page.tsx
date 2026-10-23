import { Block, Card, Cards, Diagram, Docs } from "nanocode-ts/react/site";
import { href } from "@/lib/base";
import { pageMetadata } from "@/lib/metadata";

export const metadata = pageMetadata({
  description: "How nanocode on Vercel keeps a session in a Workflow run, and how a turn survives the Function that started it.",
  path: "/how-it-works",
  title: "How It Works · nanocode on Vercel",
});

const diagram = `browser ─POST─▶ chat route ─drive─▶ nanocode-ts ─▶ AI Gateway
                    │                   │
                    │ send              │ SQL batches, tool steps
                    ▼                   ▼
             Workflow run: the session's event log
                    ▲
                    │ queue delivery when a Function dies
                flow route ─drive─▶ replays the log, ends the turn`;

const journal = `// 1. Run the transaction on the drive's in-memory database
const before = sql.version()
const rows = sql.run(statements)

// 2. Queue it for the log only if it changed the database
if (sql.version() !== before) queue.push({ kind, operation, statements })

// 3. Commit everything queued as the next batch, keyed by its position
await ctx.effect(\`sql:\${n}\`, {
  name: 'nanocode.sql',
  replay: 'safe',
  input: { transactions },
}, async () => ({ writer }))`;

const agent = `import { createNanocode } from 'nanocode-ts/vercel'
import { chargeTool } from './tools'

// A nanocode agent with Code Mode, subagents and a bash whose files
// live in the session's journaled SQLite, under /workspace
export const nanocode = createNanocode({
  harnesses: [{ id: 'codex', label: 'Codex', models: [glm] }],
  tools: [chargeTool(record)],
})
`;

const crash = `{"type": "tool_start", "name": "charge",
 "args": {"amount": 42, "memo": "order 1001"}}
{"type": "chaos", "kind": "process", "effect": "tool.charge"}
{"type": "chaos", "effect": "tool.charge", "reannounced": true}
{"type": "tool_end", "name": "charge", "status": "unknown"}
{"type": "turn", "status": "completed"}`;

function Code(props: { children: string; language?: string; title?: string }) {
  return <Block code={props.children} label={props.title ?? ""} language={props.language ?? "typescript"} />;
}

export default function HowItWorks() {
  return (
    <Docs>
      <h1>How It Works</h1>
      <p>
        nanocode on Vercel runs a nanocode agent in Vercel Functions on <a href="https://github.com/vercel-labs/durable-harness">durable-harness</a>. Every SQLite write of the agent is a step in the session&apos;s Workflow run, so a turn that loses its Function continues in another one from the log. Its source is <a href="https://github.com/gakonst/nanocode-vercel-durable">gakonst/nanocode-vercel-durable</a>.
      </p>

      <h2>Overview</h2>
      <p>
        A message to the chat route becomes a submission in the session&apos;s run. The route drives the turn in its own Function. The agent is the nanocode SDK compiled to WebAssembly, and its model requests go to the Vercel AI Gateway.
      </p>
      <p>
        When a Function dies, a queue message delivers the session to the flow route. That drive reads the log, rebuilds the agent&apos;s database from it, and finishes the turn.
      </p>
      <Diagram>{diagram}</Diagram>
      <p>
        To try it, open the <a href={href("/")}>home page</a>, press &quot;Kill the next tool call&quot;, then ask for a charge. The Function dies during the charge, a new one takes the turn over, and the agent reports that the charge may have gone through.
      </p>

      <h2>The Agent</h2>
      <p>
        <code>nanocodeHarness</code> from <code>nanocode-ts/vercel</code> is a durable-harness harness: a name and a <code>drive</code> function that the kernel calls for each delivery. <code>durableAgent</code> adds the chat route, the queue consumer and the session API.
      </p>
      <Code title="lib/agent.ts">{agent}</Code>

      <h2>The Journal</h2>
      <p>
        nanocode keeps its state in SQLite through the <code>SqlHost</code> interface of nanocode-ts. The harness runs each transaction on an in-memory database and records every write in a step named <code>nanocode.sql</code>, keyed by its position in the log.
      </p>
      <Code title="nanocode-ts/src/vercel/journal.ts">{journal}</Code>
      <p>
        A new drive replays the committed batches in order before it opens nanocode. The kernel keeps the first step for each key and ignores the steps of a stale drive, so every reader replays the same sequence.
      </p>

      <h2>Turns and Tools</h2>
      <ul>
        <li><strong>Submissions:</strong> The drive submits each pending message to nanocode&apos;s turn inbox with the submission id as its request id, then commits a <code>nanocode.place</code> step. A crash between the two resubmits the message, and nanocode answers <code>existing</code>.</li>
        <li><strong>Tools:</strong> Host tools are durable-harness <code>HostTool</code>s. Each call runs as a <code>tool:&lt;call id&gt;</code> step with the tool&apos;s <code>replay</code> rule, and nanocode reports an interrupted call to the model as an unknown outcome.</li>
        <li><strong>Models:</strong> A session keeps the harness and model the visitor picks with <code>/model</code>: Claude Haiku or Sonnet, GPT-6 Luna or Sol, or the open-weight GLM-5.3 or Kimi K3. Requests reach the AI Gateway with the deployment&apos;s OIDC token, Codex ones as <code>openai/</code>, <code>zai/</code> and <code>moonshotai/</code> ids.</li>
        <li><strong>Events:</strong> nanocode&apos;s events reach the session&apos;s live stream as <code>text</code>, <code>reasoning</code>, <code>tool_start</code>, <code>tool_end</code>, <code>turn</code> and <code>idle</code> events, which the home page renders.</li>
      </ul>

      <h2>Durability Modes</h2>
      <table>
        <thead>
          <tr><th>Mode</th><th>A write returns</th><th>The drive waits for the log</th></tr>
        </thead>
        <tbody>
          <tr><td><code>on</code> (default)</td><td>After the local transaction</td><td>Before a <code>never</code> tool and when the drive ends</td></tr>
          <tr><td><code>strict</code></td><td>After its batch commits</td><td>At every write</td></tr>
        </tbody>
      </table>
      <p>
        With <code>on</code>, a crash loses the writes after the last durable one, never a write in between. nanocode then repeats the model calls whose results were lost, and a <code>never</code> tool runs only after its receipt is in the log.
      </p>

      <h2>Crash Recovery</h2>
      <p>
        These are the live events of a turn on this deployment, with the Function killed 1.5 s into the charge. The second <code>chaos</code> event comes from the drive that took the turn over.
      </p>
      <Code language="json">{crash}</Code>
      <p>
        The kernel records the charge step as interrupted, because its replay rule is <code>never</code>. The next drive replays the batches and nanocode resumes the turn from its checkpoint. The model receives &quot;Tool execution interrupted by a host crash; outcome unknown.&quot; and does not charge again, and the deployment&apos;s logs hold one charge.
      </p>

      <h2>Measurements</h2>
      <p>
        Four interleaved rounds on 2026-10-20, from San Francisco against two previews in <code>iad1</code> with Sonnet 5.5, measured the time from a message to its <code>idle</code> event before and after run-ahead durability and live deltas.
      </p>
      <table>
        <thead>
          <tr><th>Turn</th><th>Before</th><th>After</th></tr>
        </thead>
        <tbody>
          <tr><td>First turn, &quot;Say ok.&quot;</td><td>2.97 s</td><td>2.21 s</td></tr>
          <tr><td>A turn with <code>bash</code> and <code>read_file</code></td><td>5.26 s</td><td>3.74 s</td></tr>
          <tr><td>Follow-up, &quot;Say done.&quot;</td><td>2.72 s</td><td>1.25 s</td></tr>
        </tbody>
      </table>
      <p>
        After the change, a drive took its model calls plus about 0.1 s. Replaying the log took 0 to 5 ms, opening nanocode 9 to 17 ms, and about 6,200 of each call&apos;s 6,400 input tokens came from the gateway&apos;s prompt cache.
      </p>

      <h2>Limits</h2>
      <ul>
        <li><strong>Session size:</strong> A Workflow run holds at most 10,000 steps and 25,000 events, and a turn takes about 5 to 12 steps.</li>
        <li><strong>Replay:</strong> Every cold drive reads the whole log and replays every batch. Nothing snapshots the database yet.</li>
        <li><strong>Steering:</strong> A message sent during a turn becomes the next turn.</li>
        <li><strong>Demo policy:</strong> A prompt holds at most 2,000 characters and a session at most 20 prompts. The firewall allows 30 requests a minute per address.</li>
      </ul>

      <h2>More</h2>
      <Cards>
        <Card href="https://github.com/gakonst/nanocode-vercel-durable" title="Source →">The app, its tools and the crash drill.</Card>
        <Card href="https://github.com/gakonst/nanocode-ts" title="nanocode-ts →">The harness and the journal, as nanocode-ts/vercel.</Card>
        <Card href="https://vercel.com/blog/making-every-harness-durable" title="durable-harness →">How Vercel makes Pi, OpenCode, Claude Code and Codex durable.</Card>
        <Card href="https://nanocode.xyz/cloudflare/" title="nanocode on Cloudflare →">The same agent in Durable Objects.</Card>
        <Card href="https://nanocode.xyz/docs/introduction/getting-started" title="nanocode docs →">The SDK, its runtime and nanocode-ts.</Card>
        <Card href="https://workflow-sdk.dev/worlds" title="Worlds →">The log, queue and stream behind every session.</Card>
      </Cards>
    </Docs>
  );
}
