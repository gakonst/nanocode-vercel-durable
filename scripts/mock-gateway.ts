import { createServer } from "node:http";
import { Readable } from "node:stream";
import { scriptedDispatch } from "./scripted.ts";

const port = Number(process.argv[2] ?? 4011);
const log = process.argv[3] ?? "output/mock-gateway.jsonl";
const key = process.env.AI_GATEWAY_API_KEY;
const claude = scriptedDispatch("claude", log);
const codex = scriptedDispatch("codex", log);

createServer(async (request, response) => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  const headers = Object.entries(request.headers).flatMap(([name, value]) => typeof value === "string" ? [[name, value] as [string, string]] : []);
  if (key && request.headers.authorization !== `Bearer ${key}`) {
    response.writeHead(401).end("missing the gateway key");
    return;
  }
  const dispatch = request.url?.startsWith("/v1/responses") ? codex : request.url?.startsWith("/v1/messages") ? claude : undefined;
  if (!dispatch) {
    response.writeHead(404).end();
    return;
  }
  const answer = await dispatch({ endpoint: `http://127.0.0.1:${port}${request.url}`, method: request.method ?? "POST", headers, body: Buffer.concat(chunks) }, new AbortController().signal);
  response.writeHead(answer.status, Object.fromEntries(answer.headers));
  Readable.fromWeb(answer.body! as import("node:stream/web").ReadableStream).pipe(response);
}).listen(port, "127.0.0.1", () => process.stderr.write(`mock gateway on http://127.0.0.1:${port}\n`));
