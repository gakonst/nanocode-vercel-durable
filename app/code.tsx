"use client";

import type { Token } from "nanocode-ts/react";
import { useEffect, useState } from "react";

export function Code(props: { code: string; language: string }) {
  const [result, setResult] = useState<{ code: string; language: string; tokens: Token[][] }>();
  useEffect(() => {
    let active = true;
    void import("nanocode-ts/highlight").then(({ highlight }) => {
      if (active) setResult({ code: props.code, language: props.language, tokens: highlight(props.code, props.language) });
    }).catch(() => {});
    return () => { active = false; };
  }, [props.code, props.language]);
  return <pre className="code"><code>{result?.code === props.code && result.language === props.language ? result.tokens.map((line, row) => <span key={row}>{row > 0 && "\n"}{line.map((token, column) => <span key={column} style={{ color: token.color, fontStyle: token.italic ? "italic" : undefined }}>{token.content}</span>)}</span>) : props.code}</code></pre>;
}
