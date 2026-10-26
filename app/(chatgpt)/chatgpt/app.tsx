"use client";

import { ChatGpt } from "nanocode-ts/react/clones";
import { ensure } from "../../_clones/account";
import { createClone, highlight, Token } from "../../_clones/chat";
import { prompts } from "../../_clones/prompts";
import { Brand, WalletButton } from "../../_clones/wallet";

const clone = createClone("nanocode-vercel-durable:chatgpt", "codex");

const ABOUT: Record<string, string> = {
  "glm-5.3": "Open-weight model from Z.ai",
  "gpt-6-luna": "Fast for everyday questions",
  "gpt-6.1-sol": "Thinks longer for harder problems",
  "kimi-k3": "Open-weight model from Moonshot AI",
};

export default function ChatGptApp(props: { needsToken: boolean }) {
  const { bound, choose, model, models } = clone.useModel();
  return (
    <ChatGpt
      actions={<WalletButton className="nc-wallet-button" />}
      config={clone.config}
      footer={<><Brand className="nc-brand" /><span className="nc-about"> · ChatGPT-style demo · durable agent in Vercel Functions</span><span className="nc-about"> · built with <a href="https://github.com/gakonst/nanocode-ts" rel="noreferrer" target="_blank">nanocode-ts</a></span><span className="nc-site"> · <a href="https://nanocode.xyz/" rel="noreferrer" target="_blank">nanocode.xyz →</a></span></>}
      highlight={highlight}
      picker={{ bound, choose, current: model.id, models: models.map(item => ({ detail: ABOUT[item.id] ?? item.name, id: item.id, label: item.label })) }}
      prompts={prompts}
      title="ChatGPT-style demo"
      before={ensure}
      sidebar={props.needsToken ? <Token className="gpt-token" /> : undefined}
      warm={() => clone.transport.warm()}
    />
  );
}
