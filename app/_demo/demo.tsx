"use client";

import { Plans } from "nanocode-ts/client";
import { Keyring } from "nanocode-ts/machines";
import { Agent, type Theme } from "nds/agent";
import * as Transport from "nanocode-ts/vercel/transport";
import { href } from "@/lib/base";
import { defaultSelection, harnesses, planHarnesses, walletHarnesses } from "@/lib/settings";

const PROMPTS = [
  "Clone vercel/ai and chart its largest source files with Python",
  "Run a WebAssembly add function",
  "Store a note in the Tempo gateway's KV and read it back",
  "Search the web with Mercator for today's Tempo news, spending at most $0.05",
];

export default function Demo(props: { chaos?: boolean; needsToken: boolean; theme: Theme; title?: string }) {
  return (
    <Agent
      apply={(event, note) => {
        if (event.type === "chaos") note("tool", event.reannounced ? "A new Function took the turn over and replays it from the log." : `The Function died during ${typeof event.effect === "string" ? event.effect : "a step"}.`);
        else if (event.type === "effort" && typeof event.thinking === "string") note("tool", `Reasoning effort is ${event.thinking} from the next turn.`);
      }}
      connect={({ headers, selection, session }) => {
        const transport = Transport.create({ chaosUrl: href("/api/chaos"), hands: true, headers, selection: () => ({ effort: selection().thinking, harness: selection().harness, model: selection().model, payer: selection().payer }), session, url: href("/api/chat") });
        return {
          keyring: Keyring.create({ headers, scope: async () => { const id = await transport.open(); return id ? { sessionId: id } : undefined; }, url: href("/api/keys") }),
          plans: Plans.create({ headers, url: href("/api/plans") }),
          transport,
        };
      }}
      {...(props.chaos ? { crash: "Armed: the next tool call kills its Function 1.5 s in." } : {})}
      effortCommand
      footer={props.title && <Footer title={props.title} />}
      harnesses={harnesses}
      model={defaultSelection.model}
      planHarnesses={planHarnesses}
      prompts={PROMPTS}
      scripts
      storage="nanocode-vercel-durable"
      theme={props.theme}
      {...(props.title ? { title: props.title } : {})}
      token={props.needsToken}
      wallet={{ name: "nanocode on Vercel", relay: href("/api/device/"), websiteUrl: "https://nanocode.xyz/vercel/" }}
      walletHarnesses={walletHarnesses}
    />
  );
}

function Footer(props: { title: string }) {
  return (
    <>
      <a className="nc-brand" href="https://nanocode.xyz/vercel" rel="noreferrer" target="_blank">
        <svg aria-hidden="true" height="12" viewBox="0 0 76 65" width="14"><path d="M37.5 0 75 65H0z" fill="currentColor" /></svg>
        on Vercel
      </a>
      <span className="nc-about"> · {props.title} · durable agent in Vercel Functions</span>
      <span className="nc-about"> · built with <a href="https://github.com/nanocodexyz/nanocode-ts" rel="noreferrer" target="_blank">nanocode-ts</a></span>
      <span className="nc-site"> · <a href="https://nanocode.xyz/" rel="noreferrer" target="_blank">nanocode.xyz →</a></span>
    </>
  );
}
