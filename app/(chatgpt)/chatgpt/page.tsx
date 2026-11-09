import { Demo } from "../../_demo/client";
import { clone } from "../../_clones/metadata";

export const dynamic = "force-dynamic";

export const metadata = clone({
  description: "A ChatGPT-style chat on nanocode-ts's headless React components, with durable nanocode agents in Vercel Functions.",
  path: "/chatgpt",
  title: "ChatGPT-style demo · nanocode on Vercel",
});

export default function Page() {
  return <Demo needsToken={!!process.env.CHAT_TOKEN} theme="codex" title="ChatGPT-style demo" />;
}
