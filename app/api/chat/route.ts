import { agent, durability } from "@/lib/agent";
import { authorize, isPublic, MAX_PROMPT_CHARACTERS, MAX_PROMPTS_PER_SESSION } from "@/lib/authorize";
import { defaultSelection, harnesses, selection } from "@/lib/settings";

export const maxDuration = 300;

const chat = agent.chatRoute(authorize ? { authorize } : {});

export const GET = chat.GET;

type Body = { harness?: unknown; model?: unknown; sessionId?: unknown; text?: unknown };

export async function POST(request: Request) {
  const body = await request.clone().json().catch(() => undefined) as Body | undefined;
  if (!body || typeof body !== "object") return chat.POST(request);
  if (isPublic && typeof body.text === "string" && body.text.length > MAX_PROMPT_CHARACTERS) return new Response(`A prompt on this demo is at most ${MAX_PROMPT_CHARACTERS} characters.`, { status: 413 });
  if (typeof body.sessionId === "string") {
    if (isPublic) {
      const state = await agent.sessions.inspect(body.sessionId).catch(() => undefined);
      const prompts = state?.submissions.filter(submission => submission.kind !== "chaos" && submission.kind !== "withdraw").length ?? 0;
      if (prompts >= MAX_PROMPTS_PER_SESSION) return new Response(`A session on this demo takes at most ${MAX_PROMPTS_PER_SESSION} prompts. Start a new session.`, { status: 429 });
    }
    return chat.POST(request);
  }
  if (body.sessionId !== undefined || typeof body.text !== "string" || !body.text) return chat.POST(request);
  const chosen = body.harness === undefined && body.model === undefined ? defaultSelection : selection(body.harness, body.model);
  if (!chosen) return new Response(`harness and model must name one of ${harnesses.map(entry => `${entry.id} (${entry.models.map(model => model.id).join(", ")})`).join(" or ")}`, { status: 400 });
  if (typeof authorize === "function") {
    try { await authorize(request); }
    catch (refusal) { if (refusal instanceof Response) return refusal; throw refusal; }
  } else if (authorize !== "public" && process.env.NODE_ENV === "production") return chat.POST(request);
  const { sessionId } = await agent.sessions.start({ config: { durability: durability === "on" ? "run-ahead" : "strict", nanocode: chosen, traceAudience: isPublic ? "public" : "unknown" } });
  return chat.POST(new Request(request.url, { body: JSON.stringify({ ...body, sessionId }), headers: request.headers, method: "POST", signal: request.signal }));
}
