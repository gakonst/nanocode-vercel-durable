import { agent } from "@/lib/agent";
import { authorize, isPublic, MAX_PROMPT_CHARACTERS, MAX_PROMPTS_PER_SESSION } from "@/lib/authorize";

export const maxDuration = 300;

const chat = agent.chatRoute(authorize ? { authorize } : {});

export const GET = chat.GET;

export async function POST(request: Request) {
  if (!isPublic) return chat.POST(request);
  const body = await request.clone().json().catch(() => undefined) as { sessionId?: unknown; text?: unknown } | undefined;
  if (typeof body?.text === "string" && body.text.length > MAX_PROMPT_CHARACTERS) return new Response(`A prompt on this demo is at most ${MAX_PROMPT_CHARACTERS} characters.`, { status: 413 });
  if (typeof body?.sessionId === "string") {
    const state = await agent.sessions.inspect(body.sessionId).catch(() => undefined);
    const prompts = state?.submissions.filter(submission => submission.kind !== "chaos" && submission.kind !== "withdraw").length ?? 0;
    if (prompts >= MAX_PROMPTS_PER_SESSION) return new Response(`A session on this demo takes at most ${MAX_PROMPTS_PER_SESSION} prompts. Start a new session.`, { status: 429 });
  }
  return chat.POST(request);
}
