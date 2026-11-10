import { href } from "@/lib/base";
import { pageMetadata } from "@/lib/metadata";
import { Demo } from "../_demo/client";
import { Demos, Links, Page, Points, Title } from "nds/site";

export const dynamic = "force-dynamic";

export const metadata = pageMetadata({
  description: "nanocode agents made durable in Vercel Functions with durable-harness.",
  path: "/",
  player: true,
  title: "nanocode on Vercel",
});

export default function Home() {
  return (
    <Page>
      <Title subtitle="Durable agents in Functions.">nanocode on Vercel</Title>
      <Demos current="vercel" />
      <Points>
        <li><strong>One Workflow run per session.</strong> The nanocode SDK as WebAssembly in a Function, with its journal kept as the run&apos;s steps.</li>
        <li><strong>Survives a dead Function.</strong> Pick &quot;Kill the next tool call&quot; and another Function replays the log and finishes the turn.</li>
        <li><strong>A shell without a machine.</strong> Cells run bash, git, Python and WebAssembly beside the agent.</li>
        <li><strong>Yours to connect.</strong> Connect adds a Tempo Wallet, your ChatGPT or Claude plan, or your own machine.</li>
      </Points>

      <Demo chaos={process.env.HARNESS_CHAOS === "1"} needsToken={!!process.env.CHAT_TOKEN} theme="nanocode" />

      <Links>
        <a href="https://nanocode.xyz/experiments/durable-nanocode-on-vercel">How it works</a>
        <a href="https://nanocode.xyz/docs/guides/vercel">Build your own</a>
        <a href="https://nanocode.xyz/#prompts">Prompts</a>
        <a href="https://github.com/nanocodexyz/durable-vercel">Source</a>
        <a href={href("/chatgpt")}>ChatGPT-style</a>
        <a href={href("/claude")}>Claude-style</a>
      </Links>
    </Page>
  );
}
