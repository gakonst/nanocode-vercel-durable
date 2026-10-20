import { model } from "@/lib/settings";
import { Chat } from "./chat";

export const dynamic = "force-dynamic";

const suggestions = ["Charge me $42", "Write a note", "List your tools"];

export default function Home() {
  return (
    <div className="page">
      <h1>
        nanocode on Vercel.
        <br />
        Durable agents in Functions.
      </h1>
      <p className="lead">
        This agent runs in a Vercel Function: the nanocode SDK compiled to WebAssembly, with its SQLite journal kept as steps of the session&apos;s Workflow run. When a Function dies mid-turn, the queue starts another that replays the log and finishes the turn. Vercel AI Gateway serves its model requests.
      </p>

      <Chat chaos={process.env.HARNESS_CHAOS === "1"} model={model} needsToken={!!process.env.CHAT_TOKEN} suggestions={suggestions} />

      <p>
        <a href="https://github.com/gakonst/nanocode-vercel-durable/blob/main/AGENTS.md">Read how it works →</a>
      </p>
    </div>
  );
}
