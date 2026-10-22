import { href } from "@/lib/base";
import { pageMetadata } from "@/lib/metadata";
import { defaultSelection, harnesses } from "@/lib/settings";
import { Chat } from "./chat";
import { Demos, Lead, Page, Title } from "nanocode-ts/react/site";

export const dynamic = "force-dynamic";

export const metadata = pageMetadata({
  description: "nanocode agents made durable in Vercel Functions with durable-harness.",
  path: "/",
  player: true,
  title: "nanocode on Vercel",
});

const suggestions = ["Charge me $42", "Write a note", "Think about 17 × 24"];

export default function Home() {
  return (
    <Page>
      <Title subtitle="Durable agents in Functions.">nanocode on Vercel</Title>
      <Demos current="vercel" />
      <Lead>
        This agent runs in a Vercel Function: the nanocode SDK compiled to WebAssembly, with its Claude or Codex harness driving the model you pick with /model, the open-weight GLM-5.3 and Kimi K3 among them, and its SQLite journal kept as steps of the session&apos;s Workflow run. When a Function dies mid-turn, the queue starts another that replays the log and finishes the turn. Its source is <a href="https://github.com/gakonst/nanocode-vercel-durable">gakonst/nanocode-vercel-durable</a>.
      </Lead>

      <Chat chaos={process.env.HARNESS_CHAOS === "1"} defaultSelection={defaultSelection} harnesses={harnesses} needsToken={!!process.env.CHAT_TOKEN} suggestions={suggestions} />

      <p>
        <a href={href("/how-it-works")}>Read how it works →</a>
      </p>
    </Page>
  );
}
