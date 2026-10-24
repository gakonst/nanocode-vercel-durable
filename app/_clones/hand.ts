"use client";

import { handKeeper, type HandStatus } from "nanocode-ts";
import { Bash } from "nanocode-ts/bash";
import { Mcp, Payment, Payments, Wallet } from "nanocode-ts/machines";
import { useSyncExternalStore } from "react";
import { href } from "@/lib/base";

export const RELAY = "wss://nanocode-cloudflare-durable.tempo-dev.workers.dev/relay/";

const CHANNEL = "nanocode-vercel-durable:hand";

Wallet.configure({ name: "nanocode on Vercel", relay: "api/device/", websiteUrl: "https://nanocode.xyz/vercel/" });

const decoder = new TextDecoder();
const locked = Payment.locked(Mcp.servers);
let shell: Promise<Bash> | undefined;
let module: Promise<WebAssembly.Module> | undefined;

type State = { connected?: Wallet.Wallet; busy: boolean; error?: string; device?: Wallet.Prompt; hand: HandStatus & { session?: string } };

let state: State = { busy: false, hand: { state: "closed" } };
let payments: Payments.Payments | undefined;
const listeners = new Set<() => void>();

function set(next: Partial<State>) {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
}

function channel(): string {
  let value = localStorage.getItem(CHANNEL);
  if (!value) {
    value = Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, "0")).join("");
    localStorage.setItem(CHANNEL, value);
  }
  return value;
}

export const pay: typeof fetch = (input, init) => {
  const url = String(input instanceof Request ? input.url : input);
  const body = init?.body instanceof Uint8Array && Mcp.server(url) ? decoder.decode(init.body) : init?.body;
  return (payments?.fetch ?? locked)(input, body === init?.body ? init : { ...init, body });
};

const keeper = handKeeper({
  fetch: pay,
  mcpServers: Mcp.servers.map(server => ({ name: server.name, url: server.url })),
  module: () => module ??= WebAssembly.compileStreaming(fetch(href("/nanocode_wasm.wasm"))),
  onStatus: hand => set({ hand }),
  url: id => RELAY + id + "/hand",
  workspace: async () => {
    shell ??= Bash.create({ cwd: "/workspace", fetch: pay, github: { archive: (owner, repo, ref) => new URL(href("/api/github/" + owner + "/" + repo + "/" + ref), location.href).href } });
    const ready = await shell;
    return { cwd: ready.cwd, workspace: ready.workspace() };
  },
});

export async function hand(): Promise<string | undefined> {
  const id = channel();
  return (await keeper.attach(id)) ? id : undefined;
}

function use(connected: Wallet.Wallet | undefined) {
  payments = connected && Payments.create(connected, { servers: Mcp.servers });
  set({ connected });
}

if (typeof window !== "undefined") {
  Wallet.onPrompt(device => set({ device }));
  const saved = Wallet.restore();
  if (saved) void Wallet.published(saved).then(onChain => onChain && use(saved), () => {});
}

export async function login() {
  set({ busy: true, error: undefined });
  try {
    const connected = await Wallet.connect();
    await Wallet.publish(connected);
    use(connected);
  } catch (error) {
    set({ error: error instanceof Error ? error.message : String(error) });
  } finally {
    set({ busy: false, device: undefined });
  }
}

export async function logout() {
  const connected = state.connected;
  Wallet.forget();
  use(undefined);
  if (connected) await Wallet.revoke(connected).catch(() => {});
}

export function useWallet() {
  return useSyncExternalStore(listener => { listeners.add(listener); return () => void listeners.delete(listener); }, () => state, () => state);
}

export const prompts = [
  "Clone vercel/ai and chart its largest source files with Python",
  "Run a WebAssembly add function in this tab",
  "Store a note in the Tempo gateway's KV and read it back",
  "Search the web with Mercator for today's Tempo news",
];

