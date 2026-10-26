"use client";

import { createConfig } from "nanocode-ts/client";
import { vercel } from "nanocode-ts/vercel/transport";
import { useState, useSyncExternalStore } from "react";
import { href } from "@/lib/base";
import { harnesses, type Model } from "@/lib/settings";
import { Keyring } from "nanocode-ts/machines";
import { ensure, track } from "./account";

type Saved = { picked?: string; bound: Record<string, string> };

const TOKEN = "nanocode-vercel-durable:token";

export const highlight = () => import("nanocode-ts/highlight").then(module => module.highlight);

export function createClone(key: string, harness: "claude" | "codex") {
  const models: readonly Model[] = harnesses.find(entry => entry.id === harness)?.models ?? [];
  const listeners = new Set<() => void>();
  const storageKey = key + ":models";
  let saved: Saved = { bound: {} };
  let version = 0;

  try {
    saved = { ...saved, ...JSON.parse(localStorage.getItem(storageKey) ?? "{}") };
  } catch {}

  const persist = () => {
    const ids = new Set(config.getState().conversations.map(item => item.id));
    saved.bound = Object.fromEntries(Object.entries(saved.bound).filter(([id]) => ids.has(id)));
    localStorage.setItem(storageKey, JSON.stringify(saved));
    version++;
    for (const listener of listeners) listener();
  };

  const current = (): Model => {
    const conversation = config.getState().conversation;
    const id = (conversation && saved.bound[conversation]) || saved.picked;
    return models.find(model => model.id === id) ?? models[0]!;
  };

  const headers = (): Record<string, string> => {
    const token = localStorage.getItem(TOKEN);
    return token ? { authorization: "Bearer " + token } : {};
  };

  const transport = vercel({
    headers,
    selection: () => {
      const model = current();
      return { effort: model.efforts.includes("low") ? "low" : model.effort, harness, model: model.id };
    },
    session: {
      load: () => ({}),
      save: state => {
        const conversation = config.getState().conversation;
        if (!state.id || !conversation || saved.bound[conversation]) return;
        saved.bound[conversation] = current().id;
        persist();
      },
    },
    url: href("/api/chat"),
  });

  track(Keyring.keyring({ url: href("/api/keys"), headers, scope: async () => {
    const id = await transport.open();
    return id ? { sessionId: id } : undefined;
  } }));

  const config = createConfig({ history: { key }, transport });

  const choose = (id: string) => {
    const conversation = config.getState().conversation;
    saved.picked = id;
    if (conversation && saved.bound[conversation] && saved.bound[conversation] !== id) config.create();
    persist();
  };

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    const off = config.subscribe(listener);
    return () => {
      listeners.delete(listener);
      off();
    };
  };

  const useModel = () => {
    useSyncExternalStore(subscribe, () => version + ":" + config.getState().conversation, () => "");
    const conversation = config.getState().conversation;
    return { bound: Boolean(conversation && saved.bound[conversation]), choose, model: current(), models };
  };

  return { config, transport, useModel };
}

export function Token(props: { className: string }) {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN) ?? "");

  return (
    <input
      aria-label="Access token"
      className={props.className}
      onChange={event => {
        setToken(event.target.value);
        localStorage.setItem(TOKEN, event.target.value);
      }}
      placeholder="Access token (CHAT_TOKEN)"
      type="password"
      value={token}
    />
  );
}

