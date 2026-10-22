"use client";

import { createConfig, type Entry, type LiveEvent, modelItems, serverEvents, thinkingItems } from "nanocode-ts/client";
import { Chat as View, NanocodeProvider, type Picker, styles, useConfig, useSend } from "nanocode-ts/react";
import { useEffect, useRef, useState } from "react";
import { href } from "@/lib/base";
import { find, type Model, type Selection, type Thinking } from "@/lib/settings";

type Harness = { id: Selection["provider"]; label: string; models: Model[] };

type Saved = { cursor?: string; entries: Entry[]; open?: boolean; selection?: Selection; session?: string };

type Props = { chaos: boolean; defaultSelection: Selection; harnesses: Harness[]; needsToken: boolean; suggestions: string[] };

const COMMANDS = [
  { label: "/model", detail: "choose harness, model and thinking for a new session" },
  { label: "/effort", detail: "choose the thinking of the next turns" },
  { label: "/new", detail: "start a new session" },
];

const KEY = "nanocode-vercel-durable";

const TOKEN = `${KEY}:token`;

const RECONNECT_MS = 1000;

const highlight = () => import("nanocode-ts/highlight").then(module => module.highlight);

function read(): Saved {
  return { entries: [], ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
}

function save(next: Partial<Saved>) {
  localStorage.setItem(KEY, JSON.stringify({ ...read(), ...next }));
}

type Session = { selection: Selection; session?: string; cursor?: string; token: string; warmed?: { key: string; session: Promise<string | undefined> } };

export function Chat(props: Props) {
  const [setup] = useState(() => {
    const session: Session = { selection: props.defaultSelection, token: "" };
    const listeners = new Set<() => void>();
    const changed = () => { for (const listener of listeners) listener(); };
    const headers = (): HeadersInit => session.token ? { authorization: `Bearer ${session.token}` } : {};

    const follow = async (response: Response, note: (kind: "tool" | "error", text: string) => void, push: (event: LiveEvent) => void): Promise<boolean> => {
      if (!response.ok || !response.body) {
        note("error", `${response.status} ${await response.text()}`);
        return true;
      }
      try {
        for await (const message of serverEvents(response.body)) {
          if (message.id) {
            session.cursor = message.id;
            save({ cursor: session.cursor });
          }
          if (message.event === "end") return true;
          if (message.data) push(JSON.parse(message.data) as LiveEvent);
        }
      } catch {
        note("tool", "The stream dropped. Reconnecting from the last event.");
        return false;
      }
      return false;
    };

    const reconnect = async (id: string, note: (kind: "tool" | "error", text: string) => void, push: (event: LiveEvent) => void) => {
      while (session.cursor) {
        const settled = await fetch(`${href("/api/chat")}?sessionId=${encodeURIComponent(id)}&cursor=${encodeURIComponent(session.cursor)}`, { headers: headers() }).then(response => follow(response, note, push), () => false);
        if (settled) return;
        await new Promise(resolve => setTimeout(resolve, RECONNECT_MS));
      }
    };

    const config = createConfig({
      persist: { load: () => typeof localStorage === "undefined" ? [] : read().entries, save: entries => save({ entries: [...entries] }) },
      apply: event => {
        if (event.type === "chaos") config.note("tool", event.reannounced ? "A new Function took the turn over and replays it from the log." : `The Function died during ${typeof event.effect === "string" ? event.effect : "a step"}.`);
        else if (event.type === "effort" && typeof event.thinking === "string") {
          session.selection = { ...session.selection, thinking: event.thinking as Thinking };
          save({ selection: session.selection });
          changed();
          config.note("tool", `Reasoning effort is ${session.selection.thinking} from the next turn.`);
        }
      },
      transport: {
        async send({ prompt, note, push }) {
          save({ open: true, selection: session.selection });
          const key = chosen(session.selection);
          const started = !session.session && session.warmed?.key === key ? await session.warmed.session : undefined;
          session.warmed = undefined;
          const existing = session.session ?? started;
          const { selection } = session;
          const response = await fetch(href("/api/chat"), { method: "POST", headers: { "content-type": "application/json", ...headers() }, body: JSON.stringify(existing ? { sessionId: existing, text: prompt } : { effort: selection.thinking, harness: selection.provider, model: selection.model, text: prompt }) });
          const id = response.headers.get("x-session-id") ?? existing;
          if (id && id !== session.session) {
            session.session = id;
            save({ session: id });
            changed();
          }
          if (!(await follow(response, note, push)) && id) await reconnect(id, note, push);
          save({ open: false });
        },
        async steer({ prompt }) {
          if (!session.session) return false;
          const kind = /^\/effort\s/.test(prompt) ? "prompt" : "steer";
          const response = await fetch(href("/api/chat"), { method: "POST", headers: { "content-type": "application/json", ...headers() }, body: JSON.stringify({ kind, sessionId: session.session, text: prompt }) });
          if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
          void response.body?.cancel();
          return false;
        },
        async resume({ note, push }) {
          if (session.session) await reconnect(session.session, note, push);
          save({ open: false });
        },
      },
    });

    return {
      config,
      session,
      headers,
      subscribe: (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener); },
      changed,
    };
  });

  return (
    <NanocodeProvider config={setup.config} highlight={highlight}>
      <Agent {...props} setup={setup} />
    </NanocodeProvider>
  );
}

function chosen(selection: Selection) {
  return `${selection.provider}/${selection.model}/${selection.thinking}`;
}

function Agent(props: Props & { setup: { session: Session; headers(): HeadersInit; subscribe(listener: () => void): () => void; changed(): void } }) {
  const { chaos, harnesses, needsToken, setup, suggestions } = props;
  const { session } = setup;
  const config = useConfig();
  const { send, isPending: busy } = useSend();
  const [picker, setPicker] = useState<Picker | null>(null);
  const [token, setToken] = useState("");
  const [, setVersion] = useState(0);
  const started = useRef(false);

  useEffect(() => setup.subscribe(() => setVersion(version => version + 1)), [setup]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const saved = read();
    const known = saved.selection && find(saved.selection.model);
    if (saved.selection && known) session.selection = { ...saved.selection, thinking: known.efforts.includes(saved.selection.thinking) ? saved.selection.thinking : known.effort };
    session.session = saved.session;
    session.cursor = saved.cursor;
    session.token = localStorage.getItem(TOKEN) ?? "";
    setToken(session.token);
    setup.changed();
    if (saved.open && saved.session) void config.resume();
  }, []);

  const { selection } = session;

  const pickThinking = (model: string) => setPicker({
    title: `Thinking · ${model}`,
    items: () => thinkingItems(find(model), model === session.selection.model ? session.selection.thinking : undefined),
    onChoose: item => {
      setPicker(null);
      think(model, item.label as Thinking);
    },
  });

  const pick = (model: string) => {
    if (session.session && model !== session.selection.model) {
      setPicker(null);
      return config.note("tool", "the model is fixed for this session; use /new before choosing another model");
    }
    pickThinking(model);
  };

  const think = (model: string, level: Thinking) => {
    if (session.session) {
      if (level !== session.selection.thinking) void send(`/effort ${level}`);
      return;
    }
    const provider = harnesses.find(entry => entry.models.some(candidate => candidate.id === model))!.id;
    session.selection = { model, provider, thinking: level };
    save({ selection: session.selection });
    setup.changed();
    config.note("tool", `using ${model} · thinking ${level}`);
  };

  const reset = () => {
    localStorage.removeItem(KEY);
    session.cursor = undefined;
    session.session = undefined;
    session.warmed = undefined;
    config.clear();
    setup.changed();
  };

  const command = (text: string): boolean => {
    const [name, ...words] = text.split(/\s+/);
    const argument = words.join(" ").toLowerCase();
    if (name === "/new") {
      reset();
      config.note("tool", "new session");
      return true;
    }
    if (name === "/model") {
      if (!argument) {
        setPicker({ title: "Model", filter: true, items: query => modelItems(harnesses, session.selection.model, query), onChoose: item => pick(item.label) });
        return true;
      }
      const match = harnesses.flatMap(entry => entry.models).find(model => argument.split(" ").every(word => `${model.id} ${model.name}`.toLowerCase().includes(word)));
      if (match) pick(match.id);
      else config.note("error", `no model matches "${argument}"; choose one of ${harnesses.flatMap(entry => entry.models.map(model => model.id)).join(", ")}`);
      return true;
    }
    if (name !== "/effort") return false;
    const model = find(session.selection.model);
    if (!argument) {
      pickThinking(session.selection.model);
      return true;
    }
    if (!model?.efforts.includes(argument as Thinking)) {
      config.note("error", `${session.selection.model} takes ${model?.efforts.join("/")} thinking, not ${argument}`);
      return true;
    }
    if (session.session) return false;
    think(session.selection.model, argument as Thinking);
    return true;
  };

  const warm = (value: string) => {
    if (session.session || busy || !value || value.startsWith("/") || session.warmed?.key === chosen(session.selection)) return;
    const body = JSON.stringify({ effort: selection.thinking, harness: selection.provider, model: selection.model, warm: true });
    const started = fetch(href("/api/chat"), { method: "POST", headers: { "content-type": "application/json", ...setup.headers() }, body }).then(async response => response.ok ? (await response.json() as { sessionId?: string }).sessionId : undefined, () => undefined);
    session.warmed = { key: chosen(selection), session: started };
  };

  const crash = async () => {
    if (!session.session) return config.note("error", "Start a session before arming a crash.");
    const response = await fetch(href("/api/chaos"), { method: "POST", headers: { "content-type": "application/json", ...setup.headers() }, body: JSON.stringify({ sessionId: session.session, at: "tool", afterMs: 1500 }) });
    if (response.ok) config.note("tool", "Armed: the next tool call kills its Function 1.5 s in.");
    else config.note("error", `${response.status} ${await response.text()}`);
  };

  const harness = harnesses.find(entry => entry.id === selection.provider) ?? harnesses[0];
  const modelLabel = harness.models.find(entry => entry.id === selection.model)?.label ?? selection.model;

  return (
    <View
      actions={<button disabled={busy} onClick={reset} type="button" {...styles.suggestion({ quiet: true })}>New session</button>}
      commands={COMMANDS}
      empty="Ask a question to start a turn, or type /model to choose a model."
      extras={needsToken && (
        <label {...styles.row()}>
          <span aria-hidden="true" {...styles.chevron()}>#</span>
          <input
            aria-label="Access token"
            onChange={event => {
              setToken(event.target.value);
              session.token = event.target.value;
              localStorage.setItem(TOKEN, event.target.value);
            }}
            placeholder="Access token (CHAT_TOKEN)"
            type="password"
            value={token}
            {...styles.input()}
          />
        </label>
      )}
      link={{ href: "https://nanocode.xyz/", label: "nanocode.xyz →" }}
      onInput={warm}
      onPickerClose={() => setPicker(null)}
      onSubmit={text => { if (!command(text)) void send(text); }}
      picker={picker}
      status={`${harness.label} · ${modelLabel} · ${selection.thinking} · ${session.session ?? "new session"} · ${busy ? "running" : "idle"}`}
      suggestions={[...suggestions, ...(chaos ? [{ label: "Kill the next tool call", onClick: () => void crash(), disabled: !session.session }] : [])]}
    />
  );
}
