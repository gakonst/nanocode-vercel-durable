"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import type { Selection } from "@/lib/settings";

type Kind = "assistant" | "error" | "reasoning" | "tool" | "user";

type Entry = { kind: Kind; text: string };

type Harness = { id: Selection["provider"]; label: string; models: { id: string; label: string }[] };

type Saved = { cursor?: string; entries: Entry[]; open?: boolean; selection?: Selection; session?: string };

type Live = { type: string; delta?: string; name?: string; args?: unknown; status?: string; result?: string | { text?: string }; error?: unknown; message?: string; effect?: string; reannounced?: boolean; kind?: Kind; text?: string; turn?: number };

type Stream = { kind?: "assistant" | "reasoning"; posted: number; shown: number; text: string };

const KEY = "nanocode-vercel-durable";

const TOKEN = `${KEY}:token`;

const RECONNECT_MS = 1000;

const RESULT_CHARACTERS = 160;

const TYPING_DELAY_MS = 500;

const REVEAL_MS = 100;

const FRAME_MS = 16;

export function Chat(props: { chaos: boolean; defaultSelection: Selection; harnesses: Harness[]; needsToken: boolean; suggestions: string[] }) {
  const { chaos, defaultSelection, harnesses, needsToken, suggestions } = props;
  const [entries, setEntries] = useState<Entry[]>([]);
  const [live, setLive] = useState<Entry | null>(null);
  const [session, setSession] = useState<string>();
  const [selection, setSelection] = useState<Selection>(defaultSelection);
  const [token, setToken] = useState("");
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [typing, setTyping] = useState(false);
  const cursor = useRef<string | undefined>(undefined);
  const stream = useRef<Stream>({ posted: 0, shown: 0, text: "" });
  const queue = useRef<Live[]>([]);
  const frame = useRef(0);
  const clock = useRef(0);
  const asking = useRef(0);
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

  const flush = () => {
    const { kind, posted, text } = stream.current;
    if (kind === "assistant") for (const chunk of paragraphs(text, posted, true).chunks) add({ kind, text: chunk });
    else if (kind === "reasoning" && text.trim()) add({ kind, text: text.trim() });
    stream.current = { posted: 0, shown: 0, text: "" };
    setLive(null);
  };

  const render = () => {
    const current = stream.current;
    const visible = current.text.slice(0, current.shown);
    if (current.kind === "assistant") {
      const { chunks, next } = paragraphs(visible, current.posted);
      current.posted = next;
      for (const chunk of chunks) add({ kind: current.kind, text: chunk });
    }
    const rest = visible.slice(current.posted).trim();
    setLive(rest && current.kind ? { kind: current.kind, text: rest } : null);
  };

  const step = () => {
    frame.current = 0;
    const now = performance.now();
    const elapsed = clock.current ? now - clock.current : 0;
    clock.current = now;
    const instant = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let revealed = false;
    for (;;) {
      const current = stream.current;
      const next = queue.current[0];
      const kind = next?.type === "text" ? "assistant" : next?.type === "reasoning" ? "reasoning" : undefined;
      if (next && kind && (!current.kind || current.kind === kind)) {
        queue.current.shift();
        current.kind = kind;
        current.text += next.delta ?? "";
        continue;
      }
      if (current.shown < current.text.length) {
        if (revealed) break;
        revealed = true;
        const backlog = current.text.length - current.shown;
        current.shown += instant ? backlog : Math.max(1, Math.ceil(backlog * (1 - Math.exp(-elapsed / REVEAL_MS))));
        render();
        continue;
      }
      if (!next) break;
      queue.current.shift();
      apply(next);
    }
    if (queue.current.length || stream.current.shown < stream.current.text.length) frame.current = window.setTimeout(step, FRAME_MS);
    else clock.current = 0;
  };

  const enqueue = (event: Live) => {
    queue.current.push(event);
    if (!frame.current) frame.current = window.setTimeout(step);
  };

  const note = (kind: Kind, text: string) => enqueue({ type: "note", kind, text });

  const apply = (event: Live) => {
    flush();
    if (event.type === "text" || event.type === "reasoning") {
      stream.current.kind = event.type === "text" ? "assistant" : "reasoning";
      stream.current.text = event.delta ?? "";
    } else if (event.type === "note" && event.kind) add({ kind: event.kind, text: event.text ?? "" });
    else if (event.type === "done") {
      if (event.turn === asking.current) {
        save({ open: false });
        setBusy(false);
      }
    } else if (event.type === "idle") setBusy(false);
    else if (event.type === "tool_start") add({ kind: "tool", text: `${event.name} ${JSON.stringify(event.args)}` });
    else if (event.type === "tool_end") add({ kind: "tool", text: `${event.name} ${event.status}: ${clip(typeof event.result === "string" ? event.result : event.result?.text ?? "")}` });
    else if (event.type === "chaos") add({ kind: "tool", text: event.reannounced ? "A new Function took the turn over and replays it from the log." : `The Function died during ${event.effect ?? "a step"}.` });
    else if (event.type === "retrying") add({ kind: "tool", text: `Retrying: ${JSON.stringify(event.error ?? event.message ?? "")}` });
    else if (event.type === "turn" && event.status !== "completed") add({ kind: "error", text: `The turn ${event.status}: ${JSON.stringify(event.error ?? "")}` });
    else if (event.type === "error") add({ kind: "error", text: event.message ?? JSON.stringify(event) });
  };

  const headers = (): HeadersInit => token ? { authorization: `Bearer ${token}` } : {};

  const follow = async (response: Response): Promise<boolean> => {
    if (!response.ok || !response.body) {
      const detail = await response.text();
      note("error", `${response.status} ${detail}`);
      return true;
    }
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffered = "";
    for (;;) {
      const read = await reader.read().catch(() => undefined);
      if (!read) {
        note("tool", "The stream dropped. Reconnecting from the last event.");
        return false;
      }
      const { done, value } = read;
      if (done) {
        enqueue({ type: "flush" });
        return false;
      }
      buffered += value;
      let end: number;
      while ((end = buffered.indexOf("\n\n")) >= 0) {
        const block = buffered.slice(0, end);
        buffered = buffered.slice(end + 2);
        let name = "message";
        let data = "";
        for (const line of block.split("\n")) {
          if (line.startsWith("id:")) {
            cursor.current = line.slice(3).trim() || cursor.current;
            save({ cursor: cursor.current });
          } else if (line.startsWith("event:")) name = line.slice(6).trim();
          else if (line.startsWith("data:")) data += line.slice(5).trim();
        }
        if (name === "end") {
          enqueue({ type: "flush" });
          return true;
        }
        if (data) enqueue(JSON.parse(data) as Live);
      }
    }
  };

  const reconnect = async (id: string) => {
    while (cursor.current) {
      const settled = await fetch(`/api/chat?sessionId=${encodeURIComponent(id)}&cursor=${encodeURIComponent(cursor.current)}`, { headers: headers() }).then(follow, () => false);
      if (settled) return;
      await new Promise(resolve => setTimeout(resolve, RECONNECT_MS));
    }
  };

  useEffect(() => {
    const saved: Saved = { entries: [], ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
    setEntries(saved.entries);
    setSession(saved.session);
    if (saved.selection) setSelection(saved.selection);
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

  const ask = async (text: string) => {
    if (!text || busy) return;
    const mine = ++asking.current;
    setPrompt("");
    setBusy(true);
    note("user", text);
    save({ open: true, selection });
    try {
      const response = await fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json", ...headers() }, body: JSON.stringify(session ? { sessionId: session, text } : { harness: selection.provider, model: selection.model, text }) });
      const id = response.headers.get("x-session-id") ?? session;
      if (id && id !== session) {
        setSession(id);
        save({ session: id });
      }
      if (!(await follow(response)) && id) await reconnect(id);
    } catch (error) {
      note("error", error instanceof Error ? error.message : String(error));
    } finally {
      enqueue({ type: "done", turn: mine });
    }
  };

  const crash = async () => {
    if (!session) return note("error", "Start a session before arming a crash.");
    const response = await fetch("/api/chaos", { method: "POST", headers: { "content-type": "application/json", ...headers() }, body: JSON.stringify({ sessionId: session, at: "tool", afterMs: 1500 }) });
    if (response.ok) note("tool", "Armed: the next tool call kills its Function 1.5 s in.");
    else note("error", `${response.status} ${await response.text()}`);
  };

  const reset = () => {
    localStorage.removeItem(KEY);
    cursor.current = undefined;
    clearTimeout(frame.current);
    frame.current = 0;
    clock.current = 0;
    queue.current = [];
    stream.current = { posted: 0, shown: 0, text: "" };
    setLive(null);
    setSession(undefined);
    setEntries([]);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void ask(prompt.trim());
  };

  const harness = harnesses.find(entry => entry.id === selection.provider) ?? harnesses[0];
  const modelLabel = harness.models.find(entry => entry.id === selection.model)?.label ?? selection.model;
  const shown = live ? [...entries, live] : entries;
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
        {shown.length === 0 && <p className="entry entry-tool">Pick a harness and a model, then ask a question to start a turn.</p>}
        {shown.map((entry, index) => {
          const previous = shown[index - 1];
          const label = entry.kind === "user" ? "you" : !previous || previous.kind === "user" ? "agent" : undefined;
          return (
            <div className="turn" key={index}>
              {label && <p className={`speaker speaker-${label}`}><span aria-hidden="true">●</span> {label}</p>}
              <p className={`entry entry-${entry.kind}${entry === live ? " entry-live" : ""}`}>{entry.kind === "reasoning" ? entry.text.replace(/\*\*(.+?)\*\*/g, "$1") : entry.text}</p>
            </div>
          );
        })}
      </div>

      <p aria-live="polite" className={typing ? "typing typing-visible" : "typing"}>
        {typing && <><span className="speaker speaker-agent">agent</span> {live?.kind === "reasoning" ? "is thinking" : "is typing"}</>}
      </p>

      {!session && (
        <div className="row picker">
          <span aria-hidden="true" className="chevron">❯</span>
          <span className="picker-label">harness</span>
          {harnesses.map(entry => (
            <button aria-pressed={entry.id === selection.provider} className="option" disabled={busy} key={entry.id} onClick={() => setSelection({ model: entry.models[0].id, provider: entry.id })} type="button">
              {entry.label}
            </button>
          ))}
          <span className="picker-label">model</span>
          {harness.models.map(entry => (
            <button aria-pressed={entry.id === selection.model} className="option" disabled={busy} key={entry.id} onClick={() => setSelection({ model: entry.id, provider: harness.id })} type="button">
              {entry.label}
            </button>
          ))}
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

      <form className="row" onSubmit={submit}>
        <span aria-hidden="true" className="chevron">❯</span>
        <textarea
          aria-label="Prompt"
          className="input"
          disabled={busy}
          onChange={event => setPrompt(event.target.value)}
          onKeyDown={event => {
            if (event.key !== "Enter" || event.shiftKey) return;
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }}
          placeholder="Ask the agent"
          ref={input}
          rows={1}
          value={prompt}
        />
        <button className="send" disabled={busy} type="submit">
          <kbd className="key">ENTER</kbd>
        </button>
      </form>

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
        <span>{`${harness.label} · ${modelLabel} · ${session ?? "new session"} · ${busy ? "running" : "idle"}`}</span>
        <button className="suggestion" disabled={busy} onClick={reset} type="button">New session</button>
      </p>
    </section>
  );
}

function paragraphs(text: string, from: number, final = false): { chunks: string[]; next: number } {
  const chunks: string[] = [];
  let start = from;
  let fenced = (text.slice(0, from).match(/^```/gm)?.length ?? 0) % 2 === 1;
  let index = from;
  while (index < text.length) {
    const line = text.indexOf("\n", index);
    if (line === -1) break;
    if (text.startsWith("```", index)) fenced = !fenced;
    if (!fenced && text.startsWith("\n", line + 1)) {
      const chunk = text.slice(start, line).trim();
      if (chunk) chunks.push(chunk);
      start = line + 2;
    }
    index = line + 1;
  }
  if (!final) return { chunks, next: start };
  const rest = text.slice(start).trim();
  if (rest) chunks.push(rest);
  return { chunks, next: text.length };
}

function clip(text: string): string {
  return text.length > RESULT_CHARACTERS ? `${text.slice(0, RESULT_CHARACTERS)}…` : text;
}
