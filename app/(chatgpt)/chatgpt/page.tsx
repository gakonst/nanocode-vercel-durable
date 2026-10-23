import { clone } from "../../_clones/metadata";
import { Client } from "./client";

export const dynamic = "force-dynamic";

export const metadata = clone({
  description: "A ChatGPT-style chat on nanocode-ts's headless React components, with durable nanocode agents in Vercel Functions.",
  path: "/chatgpt",
  title: "ChatGPT-style demo · nanocode on Vercel",
});

export default function Page() {
  return <Client needsToken={!!process.env.CHAT_TOKEN} />;
}
