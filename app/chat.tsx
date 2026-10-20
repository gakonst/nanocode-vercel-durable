"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";

type Entry = { kind: "assistant" | "error" | "tool" | "user"; text: string };

type Saved = { cursor?: string; entries: Entry[]; open?: boolean; session?: string };

type Live = { type: string; delta?: string; name?: string; args?: unknown; status?: string; result?: string | { text?: string }; error?: unknown; message?: string; effect?: string; reannounced?: boolean };

const KEY = "nanocode-vercel-durable";

const TOKEN = `${KEY}:token`;

const RECONNECT_MS = 1000;

const RESULT_CHARACTERS = 160;

export function Chat(props: { chaos: boolean; model: string; needsToken: boolean; suggestions: string[] }) {
  const { chaos, model, needsToken, suggestions } = props;
  const [entries, setEntries] = useState<Entry[]>([]);
  const [session, setSession] = useState<string>();
  const [token, setToken] = useState("");
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const cursor = useRef<string | undefined>(undefined);
  const log = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  const save = (next: Partial<Saved>) => {
    const saved: Saved = { entries: [], ...JSON.parse(localStorage.getItem(KEY) ?? "{}"), ...next };
    localStorage.setItem(KEY, JSON.stringify(saved));
  };

  const add = (entry: Entry) => setEntries(current => {
    const last = current.at(-1);
    const next = entry.kind === "assistant" && last?.kind === "assistant" ? [...current.slice(0, -1), { kind: "assistant" as const, text: last.text + entry.text }] : [...current, entry];
    save({ entries: next });
    return next;
  });

  const apply = (event: Live) => {
    if (event.type === "text" && event.delta) add({ kind: "assistant", text: event.delta });
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
      add({ kind: "error", text: `${response.status} ${detail}` });
      return true;
    }
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffered = "";
    for (;;) {
      const read = await reader.read().catch(() => undefined);
      if (!read) {
        add({ kind: "tool", text: "The stream dropped. Reconnecting from the last event." });
        return false;
      }
      const { done, value } = read;
      if (done) return false;
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
        if (name === "end") return true;
        if (data) apply(JSON.parse(data) as Live);
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
    cursor.current = saved.cursor;
    setToken(localStorage.getItem(TOKEN) ?? "");
    if (saved.open && saved.session) {
      setBusy(true);
      void reconnect(saved.session).finally(() => { save({ open: false }); setBusy(false); });
    }
  }, []);

  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight });
  }, [entries]);

  const ask = async (text: string) => {
    if (!text || busy) return;
    setPrompt("");
    setBusy(true);
    add({ kind: "user", text });
    save({ open: true });
    try {
      const response = await fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json", ...headers() }, body: JSON.stringify({ sessionId: session, text }) });
      const id = response.headers.get("x-session-id") ?? session;
      if (id && id !== session) {
        setSession(id);
        save({ session: id });
      }
      if (!(await follow(response)) && id) await reconnect(id);
    } catch (error) {
      add({ kind: "error", text: error instanceof Error ? error.message : String(error) });
    } finally {
      save({ open: false });
      setBusy(false);
    }
  };

  const crash = async () => {
    if (!session) return add({ kind: "error", text: "Start a session before arming a crash." });
    const response = await fetch("/api/chaos", { method: "POST", headers: { "content-type": "application/json", ...headers() }, body: JSON.stringify({ sessionId: session, at: "tool", afterMs: 1500 }) });
    add(response.ok ? { kind: "tool", text: "Armed: the next tool call kills its Function 1.5 s in." } : { kind: "error", text: `${response.status} ${await response.text()}` });
  };

  const reset = () => {
    localStorage.removeItem(KEY);
    cursor.current = undefined;
    setSession(undefined);
    setEntries([]);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void ask(prompt.trim());
  };

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
        {entries.length === 0 && <p className="entry entry-tool">Ask a question to start a turn.</p>}
        {entries.map((entry, index) => <p className={`entry entry-${entry.kind}`} key={index}>{entry.text}</p>)}
      </div>

      {needsToken && (
        <label className="row">
          <span aria-hidden="true">#</span>
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
        <span aria-hidden="true">›</span>
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
        <span>{`${model} · ${session ?? "new session"} · ${busy ? "running" : "idle"}`}</span>
        <button className="suggestion" disabled={busy} onClick={reset} type="button">New session</button>
      </p>
    </section>
  );
}

function clip(text: string): string {
  return text.length > RESULT_CHARACTERS ? `${text.slice(0, RESULT_CHARACTERS)}…` : text;
}
