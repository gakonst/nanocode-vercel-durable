"use client";

import { createConfig, type Entry, modelItems, thinkingItems } from "nanocode-ts/client";
import { Chat as View, NanocodeProvider, type Picker, styles, useConfig, useSend } from "nanocode-ts/react";
import { vercel, type VercelTransport } from "nanocode-ts/vercel/transport";
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

const highlight = () => import("nanocode-ts/highlight").then(module => module.highlight);

function read(): Saved {
  return { entries: [], ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
}

function save(next: Partial<Saved>) {
  localStorage.setItem(KEY, JSON.stringify({ ...read(), ...next }));
}

type Session = { selection: Selection; token: string };

type Setup = { session: Session; transport: VercelTransport; subscribe(listener: () => void): () => void; changed(): void };

export function Chat(props: Props) {
  const [setup] = useState(() => {
    const session: Session = { selection: props.defaultSelection, token: "" };
    const listeners = new Set<() => void>();
    const changed = () => { for (const listener of listeners) listener(); };
    const transport = vercel({
      url: href("/api/chat"),
      chaosUrl: href("/api/chaos"),
      headers: (): Record<string, string> => session.token ? { authorization: `Bearer ${session.token}` } : {},
      selection: () => ({ harness: session.selection.provider, model: session.selection.model, effort: session.selection.thinking }),
      session: {
        load: () => {
          if (typeof localStorage === "undefined") return {};
          const saved = read();
          return { id: saved.session, cursor: saved.cursor, open: saved.open };
        },
        save: state => {
          save({ session: state.id, cursor: state.cursor, open: state.open, selection: session.selection });
          changed();
        },
      },
    });
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
      transport,
    });
    return { config, session, transport, changed, subscribe: (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener); } };
  });

  return (
    <NanocodeProvider config={setup.config} highlight={highlight}>
      <Agent {...props} setup={setup} />
    </NanocodeProvider>
  );
}

function Agent(props: Props & { setup: Setup }) {
  const { chaos, harnesses, needsToken, setup, suggestions } = props;
  const { session, transport } = setup;
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
    if (transport.session().id && model !== session.selection.model) {
      setPicker(null);
      return config.note("tool", "the model is fixed for this session; use /new before choosing another model");
    }
    pickThinking(model);
  };

  const think = (model: string, level: Thinking) => {
    if (transport.session().id) {
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
    transport.forget();
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
    if (transport.session().id) return false;
    think(session.selection.model, argument as Thinking);
    return true;
  };

  const warm = (value: string) => {
    if (!busy && value && !value.startsWith("/")) transport.warm();
  };

  const crash = async () => {
    if (!transport.session().id) return config.note("error", "Start a session before arming a crash.");
    const response = await transport.crash();
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
      status={`${harness.label} · ${modelLabel} · ${selection.thinking} · ${transport.session().id ?? "new session"} · ${busy ? "running" : "idle"}`}
      suggestions={[...suggestions, ...(chaos ? [{ label: "Kill the next tool call", onClick: () => void crash(), disabled: !transport.session().id }] : [])]}
    />
  );
}
