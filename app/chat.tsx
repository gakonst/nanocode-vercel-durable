"use client";

import { type Entry, type LiveEvent, modelItems, serverEvents, thinkingItems } from "nanocode-ts/client";
import { Chat as View } from "nanocode-ts/ui";
import "nanocode-ts/ui.css";
import { useEffect, useRef } from "react";
import { href } from "@/lib/base";
import { find, type Model, type Selection, type Thinking } from "@/lib/settings";

type Harness = { id: Selection["provider"]; label: string; models: Model[] };

type Saved = { cursor?: string; entries: Entry[]; open?: boolean; selection?: Selection; session?: string };

const COMMANDS = [
  { label: "/model", detail: "choose harness, model and thinking for a new session" },
  { label: "/effort", detail: "choose the thinking of the next turns" },
  { label: "/new", detail: "start a new session" },
];

const KEY = "nanocode-vercel-durable";

const TOKEN = `${KEY}:token`;

const RECONNECT_MS = 1000;

export function Chat(props: { chaos: boolean; defaultSelection: Selection; harnesses: Harness[]; needsToken: boolean; suggestions: string[] }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => mount(root.current!, props), []);
  return <div ref={root} />;
}

function mount(root: HTMLElement, props: { chaos: boolean; defaultSelection: Selection; harnesses: Harness[]; needsToken: boolean; suggestions: string[] }) {
  const { chaos, defaultSelection, harnesses, needsToken, suggestions } = props;
  const saved: Saved = { entries: [], ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  const known = saved.selection && find(saved.selection.model);
  let selection: Selection = saved.selection && known ? { ...saved.selection, thinking: known.efforts.includes(saved.selection.thinking) ? saved.selection.thinking : known.effort } : defaultSelection;
  let session = saved.session;
  let cursor = saved.cursor;
  let asking = 0;
  let warmed: { key: string; session: Promise<string | undefined> } | undefined;
  let token = localStorage.getItem(TOKEN) ?? "";

  const save = (next: Partial<Saved>) => {
    const current: Saved = { entries: [], ...JSON.parse(localStorage.getItem(KEY) ?? "{}"), ...next };
    localStorage.setItem(KEY, JSON.stringify(current));
  };

  const apply = (event: LiveEvent) => {
    if (event.type === "done") {
      if (event.turn === asking) {
        save({ open: false });
        busy(false);
      }
    } else if (event.type === "idle") busy(false);
    else if (event.type === "chaos") view.note("tool", event.reannounced ? "A new Function took the turn over and replays it from the log." : `The Function died during ${typeof event.effect === "string" ? event.effect : "a step"}.`);
    else if (event.type === "effort" && typeof event.thinking === "string") {
      selection = { ...selection, thinking: event.thinking as Thinking };
      save({ selection });
      status();
      view.note("tool", `Reasoning effort is ${selection.thinking} from the next turn.`);
    }
  };

  const view = new View(root, {
    submit: text => void ask(text),
    input: text => warm(text),
    apply,
    commands: COMMANDS,
    entries: saved.entries,
    save: entries => save({ entries: [...entries] }),
    highlight: () => import("nanocode-ts/highlight").then(module => module.highlight),
    empty: "Ask a question to start a turn, or type /model to choose a model.",
    suggestions: [...suggestions, ...(chaos ? [{ label: "Kill the next tool call", run: () => void crash(), enabled: () => Boolean(session) }] : [])],
    link: { href: "https://nanocode.xyz/", label: "nanocode.xyz →" },
  });

  const reset = document.createElement("button");
  reset.className = "suggestion";
  reset.type = "button";
  reset.textContent = "New session";
  reset.addEventListener("click", () => clear());
  view.actions.append(reset);

  if (needsToken) {
    const row = document.createElement("label");
    row.className = "row";
    row.innerHTML = '<span aria-hidden="true" class="chevron">#</span><input aria-label="Access token" class="input" placeholder="Access token (CHAT_TOKEN)" type="password" />';
    const input = row.querySelector("input")!;
    input.value = token;
    input.addEventListener("input", () => {
      token = input.value;
      localStorage.setItem(TOKEN, token);
    });
    view.extras.append(row);
  }

  function status() {
    const harness = harnesses.find(entry => entry.id === selection.provider) ?? harnesses[0];
    const label = harness.models.find(entry => entry.id === selection.model)?.label ?? selection.model;
    view.status = `${harness.label} · ${label} · ${selection.thinking} · ${session ?? "new session"} · ${view.busy ? "running" : "idle"}`;
    reset.disabled = view.busy;
    view.refresh();
  }

  function busy(value: boolean) {
    view.busy = value;
    status();
  }

  const headers = (): HeadersInit => token ? { authorization: `Bearer ${token}` } : {};

  const follow = async (response: Response): Promise<boolean> => {
    if (!response.ok || !response.body) {
      view.note("error", `${response.status} ${await response.text()}`);
      return true;
    }
    try {
      for await (const message of serverEvents(response.body)) {
        if (message.id) {
          cursor = message.id;
          save({ cursor });
        }
        if (message.event === "end") return true;
        if (message.data) view.push(JSON.parse(message.data) as LiveEvent);
      }
    } catch {
      view.note("tool", "The stream dropped. Reconnecting from the last event.");
      return false;
    }
    return false;
  };

  const reconnect = async (id: string) => {
    while (cursor) {
      const settled = await fetch(`${href("/api/chat")}?sessionId=${encodeURIComponent(id)}&cursor=${encodeURIComponent(cursor)}`, { headers: headers() }).then(follow, () => false);
      if (settled) return;
      await new Promise(resolve => setTimeout(resolve, RECONNECT_MS));
    }
  };

  const pickModel = () => view.pick({ title: "Model", filter: true, items: query => modelItems(harnesses, selection.model, query), choose: item => pick(item.label) });

  const pickThinking = (model: string) => view.pick({ title: `Thinking · ${model}`, items: () => thinkingItems(find(model), model === selection.model ? selection.thinking : undefined), choose: item => think(model, item.label as Thinking) });

  const pick = (model: string) => {
    if (session && model !== selection.model) return view.note("tool", "the model is fixed for this session; use /new before choosing another model");
    pickThinking(model);
  };

  const think = (model: string, level: Thinking) => {
    if (session) {
      if (level !== selection.thinking) void ask(`/effort ${level}`);
      return;
    }
    const provider = harnesses.find(entry => entry.models.some(candidate => candidate.id === model))!.id;
    selection = { model, provider, thinking: level };
    save({ selection });
    status();
    view.note("tool", `using ${model} · thinking ${level}`);
  };

  const command = (text: string): boolean => {
    const [name, ...words] = text.split(/\s+/);
    const argument = words.join(" ").toLowerCase();
    if (name === "/new") {
      clear();
      view.note("tool", "new session");
      return true;
    }
    if (name === "/model") {
      if (!argument) {
        pickModel();
        return true;
      }
      const match = harnesses.flatMap(entry => entry.models).find(model => argument.split(" ").every(word => `${model.id} ${model.name}`.toLowerCase().includes(word)));
      if (match) pick(match.id);
      else view.note("error", `no model matches "${argument}"; choose one of ${harnesses.flatMap(entry => entry.models.map(model => model.id)).join(", ")}`);
      return true;
    }
    if (name !== "/effort") return false;
    const model = find(selection.model);
    if (!argument) {
      pickThinking(selection.model);
      return true;
    }
    if (!model?.efforts.includes(argument as Thinking)) {
      view.note("error", `${selection.model} takes ${model?.efforts.join("/")} thinking, not ${argument}`);
      return true;
    }
    if (session) return false;
    think(selection.model, argument as Thinking);
    return true;
  };

  const steer = async (text: string) => {
    if (!session) return;
    view.note("user", text);
    const kind = /^\/effort\s/.test(text) ? "prompt" : "steer";
    const response = await fetch(href("/api/chat"), { method: "POST", headers: { "content-type": "application/json", ...headers() }, body: JSON.stringify({ kind, sessionId: session, text }) }).catch((error: unknown) => error instanceof Error ? error : new Error(String(error)));
    if (response instanceof Error) return view.note("error", response.message);
    if (!response.ok) view.note("error", `${response.status} ${await response.text()}`);
    else void response.body?.cancel();
  };

  const chosen = () => `${selection.provider}/${selection.model}/${selection.thinking}`;

  function warm(value: string) {
    if (session || view.busy || !value || value.startsWith("/") || warmed?.key === chosen()) return;
    const body = JSON.stringify({ effort: selection.thinking, harness: selection.provider, model: selection.model, warm: true });
    const started = fetch(href("/api/chat"), { method: "POST", headers: { "content-type": "application/json", ...headers() }, body }).then(async response => response.ok ? (await response.json() as { sessionId?: string }).sessionId : undefined, () => undefined);
    warmed = { key: chosen(), session: started };
  }

  async function ask(text: string) {
    if (!text || command(text)) return;
    if (view.busy) return void steer(text);
    const mine = ++asking;
    busy(true);
    view.note("user", text);
    save({ open: true, selection });
    try {
      const started = !session && warmed?.key === chosen() ? await warmed.session : undefined;
      warmed = undefined;
      const existing = session ?? started;
      const response = await fetch(href("/api/chat"), { method: "POST", headers: { "content-type": "application/json", ...headers() }, body: JSON.stringify(existing ? { sessionId: existing, text } : { effort: selection.thinking, harness: selection.provider, model: selection.model, text }) });
      const id = response.headers.get("x-session-id") ?? existing;
      if (id && id !== session) {
        session = id;
        save({ session });
        status();
      }
      if (!(await follow(response)) && id) await reconnect(id);
    } catch (error) {
      view.note("error", error instanceof Error ? error.message : String(error));
    } finally {
      view.push({ type: "done", turn: mine });
    }
  }

  async function crash() {
    if (!session) return view.note("error", "Start a session before arming a crash.");
    const response = await fetch(href("/api/chaos"), { method: "POST", headers: { "content-type": "application/json", ...headers() }, body: JSON.stringify({ sessionId: session, at: "tool", afterMs: 1500 }) });
    if (response.ok) view.note("tool", "Armed: the next tool call kills its Function 1.5 s in.");
    else view.note("error", `${response.status} ${await response.text()}`);
  }

  function clear() {
    localStorage.removeItem(KEY);
    cursor = undefined;
    session = undefined;
    warmed = undefined;
    view.clear();
    status();
  }

  status();
  if (saved.open && saved.session) {
    busy(true);
    void reconnect(saved.session).finally(() => {
      save({ open: false });
      busy(false);
    });
  }
  return () => view.dispose();
}
