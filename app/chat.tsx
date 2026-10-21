"use client";

import { type Entry, type EntryKind, type LiveEvent, modelItems, type PickerItem, serverEvents, thinkingItems, Transcript } from "nanocode-ts/client";
import { useEffect, useRef, useState } from "react";
import { href } from "@/lib/base";
import { Reply } from "./code";
import { find, type Model, type Selection, type Thinking } from "@/lib/settings";

type Harness = { id: Selection["provider"]; label: string; models: Model[] };

type Saved = { cursor?: string; entries: Entry[]; open?: boolean; selection?: Selection; session?: string };

type Picker = { kind: "model" } | { kind: "thinking"; model: string };

const COMMANDS = [
  { label: "/model", detail: "choose harness, model and thinking for a new session" },
  { label: "/effort", detail: "choose the thinking of the next turns" },
  { label: "/new", detail: "start a new session" },
];

const KEY = "nanocode-vercel-durable";

const TOKEN = `${KEY}:token`;

const RECONNECT_MS = 1000;

const TYPING_DELAY_MS = 500;

export function Chat(props: { chaos: boolean; defaultSelection: Selection; harnesses: Harness[]; needsToken: boolean; suggestions: string[] }) {
  const { chaos, defaultSelection, harnesses, needsToken, suggestions } = props;
  const [entries, setEntries] = useState<Entry[]>([]);
  const [live, setLive] = useState<Entry | null>(null);
  const [session, setSession] = useState<string>();
  const [selection, setSelection] = useState<Selection>(defaultSelection);
  const [picker, setPicker] = useState<Picker | null>(null);
  const [highlight, setHighlight] = useState(0);
  const [token, setToken] = useState("");
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [typing, setTyping] = useState(false);
  const cursor = useRef<string | undefined>(undefined);
  const transcript = useRef<Transcript | null>(null);
  const asking = useRef(0);
  const warmed = useRef<{ key: string; session: Promise<string | undefined> } | undefined>(undefined);
  const log = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  const save = (next: Partial<Saved>) => {
    const saved: Saved = { entries: [], ...JSON.parse(localStorage.getItem(KEY) ?? "{}"), ...next };
    localStorage.setItem(KEY, JSON.stringify(saved));
  };

  const add = (entry: Entry) => setEntries(current => {
    const next = [...current, entry];
    save({ entries: next });
    return next;
  });

  const apply = (event: LiveEvent) => {
    if (event.type === "done") {
      if (event.turn === asking.current) {
        save({ open: false });
        setBusy(false);
      }
    } else if (event.type === "idle") setBusy(false);
    else if (event.type === "chaos") add({ kind: "tool", text: event.reannounced ? "A new Function took the turn over and replays it from the log." : `The Function died during ${typeof event.effect === "string" ? event.effect : "a step"}.` });
    else if (event.type === "effort" && typeof event.thinking === "string") {
      const thinking = event.thinking as Thinking;
      setSelection(current => {
        const next = { ...current, thinking };
        save({ selection: next });
        return next;
      });
      add({ kind: "tool", text: `Reasoning effort is ${thinking} from the next turn.` });
    }
  };

  transcript.current ??= new Transcript({ add, apply, live: setLive, reducedMotion: () => matchMedia("(prefers-reduced-motion: reduce)").matches });

  const note = (kind: EntryKind, text: string) => transcript.current?.run(() => add({ kind, text }));

  const headers = (): HeadersInit => token ? { authorization: `Bearer ${token}` } : {};

  const follow = async (response: Response): Promise<boolean> => {
    if (!response.ok || !response.body) {
      const detail = await response.text();
      note("error", `${response.status} ${detail}`);
      return true;
    }
    try {
      for await (const message of serverEvents(response.body)) {
        if (message.id) {
          cursor.current = message.id;
          save({ cursor: cursor.current });
        }
        if (message.event === "end") {
          transcript.current?.run(() => {});
          return true;
        }
        if (message.data) transcript.current?.push(JSON.parse(message.data) as LiveEvent);
      }
    } catch {
      note("tool", "The stream dropped. Reconnecting from the last event.");
      return false;
    }
    transcript.current?.run(() => {});
    return false;
  };

  const reconnect = async (id: string) => {
    while (cursor.current) {
      const settled = await fetch(`${href("/api/chat")}?sessionId=${encodeURIComponent(id)}&cursor=${encodeURIComponent(cursor.current)}`, { headers: headers() }).then(follow, () => false);
      if (settled) return;
      await new Promise(resolve => setTimeout(resolve, RECONNECT_MS));
    }
  };

  useEffect(() => {
    const saved: Saved = { entries: [], ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
    setEntries(saved.entries);
    setSession(saved.session);
    const known = saved.selection && find(saved.selection.model);
    if (saved.selection && known) setSelection({ ...saved.selection, thinking: known.efforts.includes(saved.selection.thinking) ? saved.selection.thinking : known.effort });
    cursor.current = saved.cursor;
    setToken(localStorage.getItem(TOKEN) ?? "");
    if (saved.open && saved.session) {
      setBusy(true);
      void reconnect(saved.session).finally(() => { save({ open: false }); setBusy(false); });
    }
  }, []);

  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight });
  }, [entries, live]);

  useEffect(() => {
    if (!busy) return setTyping(false);
    const timer = setTimeout(() => setTyping(true), TYPING_DELAY_MS);
    return () => clearTimeout(timer);
  }, [busy]);

  const open = (next: Picker) => {
    setPrompt("");
    setPicker(next);
    const items = next.kind === "model" ? modelItems(harnesses, selection.model, "") : thinkingItems(find(next.model), next.model === selection.model ? selection.thinking : undefined);
    setHighlight(Math.max(0, items.filter(item => item.kind === "choice").findIndex(item => item.current)));
  };

  const close = () => {
    setPicker(null);
    setPrompt("");
  };

  const pick = (model: string) => {
    if (session && model !== selection.model) {
      close();
      note("tool", "the model is fixed for this session; use /new before choosing another model");
      return;
    }
    open({ kind: "thinking", model });
  };

  const think = (model: string, level: Thinking) => {
    close();
    if (session) {
      if (level !== selection.thinking) void ask(`/effort ${level}`);
      return;
    }
    const provider = harnesses.find(entry => entry.models.some(candidate => candidate.id === model))!.id;
    const next = { model, provider, thinking: level };
    setSelection(next);
    save({ selection: next });
    note("tool", `using ${model} · thinking ${level}`);
  };

  const command = (text: string): boolean => {
    const [name, ...words] = text.split(/\s+/);
    const argument = words.join(" ").toLowerCase();
    if (name === "/new") {
      setPrompt("");
      reset();
      note("tool", "new session");
      return true;
    }
    if (name === "/model") {
      if (!argument) {
        open({ kind: "model" });
        return true;
      }
      const match = harnesses.flatMap(entry => entry.models).find(model => argument.split(" ").every(word => `${model.id} ${model.name}`.toLowerCase().includes(word)));
      if (!match) {
        setPrompt("");
        note("error", `no model matches "${argument}"; choose one of ${harnesses.flatMap(entry => entry.models.map(model => model.id)).join(", ")}`);
        return true;
      }
      pick(match.id);
      return true;
    }
    if (name !== "/effort") return false;
    const model = find(selection.model);
    if (!argument) {
      open({ kind: "thinking", model: selection.model });
      return true;
    }
    if (!model?.efforts.includes(argument as Thinking)) {
      setPrompt("");
      note("error", `${selection.model} takes ${model?.efforts.join("/")} thinking, not ${argument}`);
      return true;
    }
    if (session) return false;
    think(selection.model, argument as Thinking);
    return true;
  };

  const steer = async (text: string) => {
    if (!session) return;
    setPrompt("");
    note("user", text);
    const kind = /^\/effort\s/.test(text) ? "prompt" : "steer";
    const response = await fetch(href("/api/chat"), { method: "POST", headers: { "content-type": "application/json", ...headers() }, body: JSON.stringify({ kind, sessionId: session, text }) }).catch((error: unknown) => error instanceof Error ? error : new Error(String(error)));
    if (response instanceof Error) return note("error", response.message);
    if (!response.ok) note("error", `${response.status} ${await response.text()}`);
    else void response.body?.cancel();
  };

  const chosen = `${selection.provider}/${selection.model}/${selection.thinking}`;

  const warm = (value: string) => {
    if (session || busy || !value || value.startsWith("/") || warmed.current?.key === chosen) return;
    const body = JSON.stringify({ effort: selection.thinking, harness: selection.provider, model: selection.model, warm: true });
    const started = fetch(href("/api/chat"), { method: "POST", headers: { "content-type": "application/json", ...headers() }, body }).then(async response => response.ok ? (await response.json() as { sessionId?: string }).sessionId : undefined, () => undefined);
    warmed.current = { key: chosen, session: started };
  };

  const ask = async (text: string) => {
    if (!text || command(text)) return;
    if (busy) return void steer(text);
    const mine = ++asking.current;
    setPrompt("");
    setBusy(true);
    note("user", text);
    save({ open: true, selection });
    try {
      const started = !session && warmed.current?.key === chosen ? await warmed.current.session : undefined;
      warmed.current = undefined;
      const existing = session ?? started;
      const response = await fetch(href("/api/chat"), { method: "POST", headers: { "content-type": "application/json", ...headers() }, body: JSON.stringify(existing ? { sessionId: existing, text } : { effort: selection.thinking, harness: selection.provider, model: selection.model, text }) });
      const id = response.headers.get("x-session-id") ?? existing;
      if (id && id !== session) {
        setSession(id);
        save({ session: id });
      }
      if (!(await follow(response)) && id) await reconnect(id);
    } catch (error) {
      note("error", error instanceof Error ? error.message : String(error));
    } finally {
      transcript.current?.push({ type: "done", turn: mine });
    }
  };

  const crash = async () => {
    if (!session) return note("error", "Start a session before arming a crash.");
    const response = await fetch(href("/api/chaos"), { method: "POST", headers: { "content-type": "application/json", ...headers() }, body: JSON.stringify({ sessionId: session, at: "tool", afterMs: 1500 }) });
    if (response.ok) note("tool", "Armed: the next tool call kills its Function 1.5 s in.");
    else note("error", `${response.status} ${await response.text()}`);
  };

  const reset = () => {
    localStorage.removeItem(KEY);
    cursor.current = undefined;
    transcript.current?.reset();
    setSession(undefined);
    setEntries([]);
    warmed.current = undefined;
  };

  const harness = harnesses.find(entry => entry.id === selection.provider) ?? harnesses[0];
  const modelLabel = harness.models.find(entry => entry.id === selection.model)?.label ?? selection.model;
  const shown = live ? [...entries, live] : entries;
  const commandQuery = !picker && /^\/\S*$/.test(prompt) ? prompt : undefined;
  const items: PickerItem[] = picker?.kind === "model" ? modelItems(harnesses, selection.model, prompt) : picker?.kind === "thinking" ? thinkingItems(find(picker.model), picker.model === selection.model ? selection.thinking : undefined) : COMMANDS.filter(entry => commandQuery !== undefined && entry.label.startsWith(commandQuery)).map(entry => ({ kind: "choice", ...entry }));
  const choices = items.filter(item => item.kind === "choice");
  const highlighted = Math.min(highlight, Math.max(0, choices.length - 1));
  const width = Math.max(0, ...choices.map(item => item.label.length));
  const choose = (item: PickerItem) => {
    if (picker?.kind === "model") pick(item.label);
    else if (picker?.kind === "thinking") think(picker.model, item.label as Thinking);
    else command(item.label);
  };
  let position = -1;
  return (
    <section
      aria-label="Agent"
      className="chat"
      onClick={event => {
        const target = event.target as HTMLElement;
        if (target.closest("a, button, input, textarea") || getSelection()?.toString()) return;
        input.current?.focus();
      }}
    >
      <div aria-live="polite" className="log" ref={log}>
        {shown.length === 0 && <p className="entry entry-tool">Ask a question to start a turn, or type /model to choose a model.</p>}
        {shown.map((entry, index) => {
          const previous = shown[index - 1];
          const label = entry.kind === "user" ? "you" : !previous || previous.kind === "user" ? "agent" : undefined;
          return (
            <div className="turn" key={index}>
              {label && <p className={`speaker speaker-${label}`}><span aria-hidden="true">●</span> {label}</p>}
              <div className={`entry entry-${entry.kind}${entry === live ? " entry-live" : ""}`}>{entry.kind === "assistant" ? <Reply text={entry.text} /> : entry.kind === "reasoning" ? entry.text.replace(/\*\*(.+?)\*\*/g, "$1") : entry.text}</div>
            </div>
          );
        })}
      </div>

      <p aria-live="polite" className={typing ? "typing typing-visible" : "typing"}>
        {typing && <><span className="speaker speaker-agent">agent</span> {live?.kind === "reasoning" ? "is thinking" : "is typing"}</>}
      </p>

      {(picker || items.length > 0) && (
        <div aria-label={picker?.kind === "model" ? "Model" : picker ? "Thinking" : "Commands"} className="picker" role="listbox">
          {picker && <p className="picker-title">{picker.kind === "model" ? "Model" : `Thinking · ${picker.model}`}</p>}
          {picker?.kind === "model" && <p className="picker-muted">filter: <span className="picker-query">{prompt}</span><span className="picker-caret">▏</span></p>}
          {picker?.kind === "model" && choices.length === 0 && <p className="picker-muted">  no matches</p>}
          {items.map(item => {
            if (item.kind === "header") return <p className="picker-header" key={`header-${item.label}`}>{item.label}</p>;
            position += 1;
            const index = position;
            return (
              <button aria-selected={index === highlighted} className="picker-choice" key={item.label} onClick={() => choose(item)} onMouseMove={() => setHighlight(index)} role="option" style={{ gridTemplateColumns: `2ch ${width}ch 2ch auto` }} type="button">
                <span className="picker-marker">{index === highlighted ? "›" : ""}</span>
                <span className="picker-label">{item.label}</span>
                <span className="picker-marker">{item.current ? "✓" : ""}</span>
                <span className="picker-detail">{item.detail}</span>
              </button>
            );
          })}
          {picker && <p className="picker-muted">{picker.kind === "model" ? "type to filter · enter select · esc cancel" : "enter select · esc cancel"}</p>}
        </div>
      )}

      {needsToken && (
        <label className="row">
          <span aria-hidden="true" className="chevron">#</span>
          <input
            aria-label="Access token"
            className="input"
            onChange={event => {
              setToken(event.target.value);
              localStorage.setItem(TOKEN, event.target.value);
            }}
            placeholder="Access token (CHAT_TOKEN)"
            type="password"
            value={token}
          />
        </label>
      )}

      <div className="row">
        <span aria-hidden="true" className="chevron">❯</span>
        <textarea
          aria-label="Prompt"
          className="input"
          onChange={event => {
            setPrompt(event.target.value);
            if (picker?.kind === "model") setHighlight(0);
            else warm(event.target.value);
          }}
          onKeyDown={event => {
            if (picker || choices.length > 0) {
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                setHighlight(Math.min(Math.max(0, highlighted + (event.key === "ArrowDown" ? 1 : -1)), Math.max(0, choices.length - 1)));
                return;
              }
              if (event.key === "Escape") {
                event.preventDefault();
                close();
                return;
              }
              if ((event.key === "Enter" && !event.shiftKey) || (event.key === "Tab" && !picker)) {
                event.preventDefault();
                if (choices[highlighted]) choose(choices[highlighted]);
                return;
              }
            }
            if (event.key !== "Enter" || event.shiftKey) return;
            event.preventDefault();
            void ask(prompt.trim());
          }}
          placeholder={picker?.kind === "model" ? "type to filter" : busy ? "Steer the running turn" : "Ask the agent, or type / for commands"}
          ref={input}
          rows={1}
          value={prompt}
        />
        <button className="send" onClick={() => void ask(prompt.trim())} type="button">
          <kbd className="key">ENTER</kbd>
        </button>
      </div>

      <div className="suggestions">
        {suggestions.map(suggestion => (
          <button className="suggestion" disabled={busy} key={suggestion} onClick={() => void ask(suggestion)} type="button">
            {suggestion}
          </button>
        ))}
        {chaos && (
          <button className="suggestion" disabled={!session} onClick={() => void crash()} type="button">
            Kill the next tool call
          </button>
        )}
      </div>

      <p className="status">
        <span>{`${harness.label} · ${modelLabel} · ${selection.thinking} · ${session ?? "new session"} · ${busy ? "running" : "idle"}`}</span>
        <button className="suggestion" disabled={busy} onClick={reset} type="button">New session</button>
        <a className="site" href="https://nanocode.xyz/" rel="noreferrer" target="_blank">nanocode.xyz →</a>
      </p>
    </section>
  );
}
