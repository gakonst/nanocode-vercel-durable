"use client";

import type { ThemedToken } from "@pierre/highlights";
import { useEffect, useState } from "react";
import { fences } from "@/lib/fences";

export function Code(props: { code: string; language: string }) {
  const [result, setResult] = useState<{ code: string; language: string; tokens: ThemedToken[][] }>();
  useEffect(() => {
    let active = true;
    void import("@/lib/highlight").then(({ highlight }) => {
      if (active) setResult({ code: props.code, language: props.language, tokens: highlight(props.code, props.language).tokens });
    }).catch(() => {});
    return () => { active = false; };
  }, [props.code, props.language]);
  return <pre className="code"><code>{result?.code === props.code && result.language === props.language ? result.tokens.map((line, row) => <span key={row}>{row > 0 && "\n"}{line.map((token, column) => <span key={column} style={{ color: token.htmlStyle?.color ?? token.color, fontStyle: token.htmlStyle?.["font-style"] === "italic" || token.fontStyle && token.fontStyle & 1 ? "italic" : undefined }}>{token.content}</span>)}</span>) : props.code}</code></pre>;
}

export function Reply(props: { text: string }) {
  return fences(props.text).map((part, index) => part.kind === "code" ? <Code code={part.text} key={index} language={part.language} /> : <span key={index}>{part.text}</span>);
}
