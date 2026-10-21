import { href } from "@/lib/base";
import { defaultSelection, harnesses } from "@/lib/settings";
import { Chat } from "./chat";

export const dynamic = "force-dynamic";

const suggestions = ["Charge me $42", "Write a note", "Think about 17 × 24"];

export default function Home() {
  return (
    <div className="page">
      <h1>
        nanocode on Vercel<span className="dot">.</span>
        <br />
        Durable agents in Functions.
      </h1>
      <p className="lead">
        This agent runs in a Vercel Function: the nanocode SDK compiled to WebAssembly, with its Codex harness driving an open-weight model you pick, GLM-5.3, Kimi K3 or MiMo V2.6 Pro, and its SQLite journal kept as steps of the session&apos;s Workflow run. When a Function dies mid-turn, the queue starts another that replays the log and finishes the turn.
      </p>

      <Chat chaos={process.env.HARNESS_CHAOS === "1"} defaultSelection={defaultSelection} harnesses={harnesses} needsToken={!!process.env.CHAT_TOKEN} suggestions={suggestions} />

      <p>
        <a href={href("/how-it-works")}>Read how it works →</a>
      </p>
    </div>
  );
}
