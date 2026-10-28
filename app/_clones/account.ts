"use client";

import { Keyring, Wallet } from "nanocode-ts/machines";
import { useSyncExternalStore } from "react";

Wallet.configure({ name: "nanocode on Vercel", relay: "api/device/", websiteUrl: "https://nanocode.xyz/vercel/" });

type State = { connected?: Wallet.AccessKey; busy: boolean; error?: string; device?: Wallet.Prompt };

let state: State = { busy: false };
const listeners = new Set<() => void>();
const keyrings = new Set<Keyring.Keyring>();

function set(next: Partial<State>) {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
}

export function track(keyring: Keyring.Keyring) {
  keyrings.add(keyring);
}

export async function ensure() {
  const connected = state.connected;
  if (connected) await Promise.all([...keyrings].map(keyring => keyring.register(connected).catch(() => {})));
}

function use(connected: Wallet.AccessKey | undefined) {
  set({ connected });
  void ensure();
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
  set({ connected: undefined });
  await Promise.all([...keyrings].map(keyring => keyring.logout().catch(() => {})));
  if (connected) await Wallet.revoke(connected).catch(() => {});
}

const server: State = { busy: false };

export function useWallet() {
  return useSyncExternalStore(listener => { listeners.add(listener); return () => void listeners.delete(listener); }, () => state, () => server);
}
