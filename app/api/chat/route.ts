import { nanocodeModule } from "nanocode-ts/vercel";
import { agent, durability } from "@/lib/agent";
import { authorize, isPublic, MAX_PROMPT_CHARACTERS } from "@/lib/authorize";
import { defaultSelection, harnesses, selection } from "@/lib/settings";

export const maxDuration = 300;

const chat = agent.chatRoute(authorize ? { authorize } : {});

export const GET = chat.GET;

type Body = { effort?: unknown; harness?: unknown; model?: unknown; sessionId?: unknown; text?: unknown; warm?: unknown };

export async function POST(request: Request) {
  const body = await request.clone().json().catch(() => undefined) as Body | undefined;
  if (!body || typeof body !== "object") return chat.POST(request);
  if (isPublic && typeof body.text === "string" && body.text.length > MAX_PROMPT_CHARACTERS) return new Response(`A prompt on this demo is at most ${MAX_PROMPT_CHARACTERS} characters.`, { status: 413 });
  if (typeof body.sessionId === "string") return chat.POST(request);
  if (body.warm === true) {
    const sessionId = await start(request, body);
    if (sessionId instanceof Response) return sessionId;
    void nanocodeModule();
    return Response.json({ sessionId });
  }
  if (body.sessionId !== undefined || typeof body.text !== "string" || !body.text) return chat.POST(request);
  const sessionId = await start(request, body);
  if (sessionId instanceof Response) return sessionId;
  return chat.POST(new Request(request.url, { body: JSON.stringify({ ...body, sessionId }), headers: request.headers, method: "POST", signal: request.signal }));
}

async function start(request: Request, body: Body): Promise<string | Response> {
  const chosen = body.harness === undefined && body.model === undefined ? defaultSelection : selection(body.harness, body.model, body.effort);
  if (!chosen) return new Response(`harness, model and effort must name one of ${harnesses.map(entry => `${entry.id} (${entry.models.map(model => `${model.id}: ${model.efforts.join("|")}`).join(", ")})`).join(" or ")}`, { status: 400 });
  if (typeof authorize === "function") {
    try { await authorize(request); }
    catch (refusal) { if (refusal instanceof Response) return refusal; throw refusal; }
  } else if (authorize !== "public" && process.env.NODE_ENV === "production") return new Response("set CHAT_TOKEN or CHAT_PUBLIC=1 to start sessions in production", { status: 401 });
  const { sessionId } = await agent.sessions.start({ config: { durability: durability === "on" ? "run-ahead" : "strict", nanocode: chosen, traceAudience: isPublic ? "public" : "unknown" } });
  return sessionId;
}
