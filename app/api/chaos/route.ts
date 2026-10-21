import { agent } from "@/lib/agent";
import { authorize } from "@/lib/authorize";

export async function POST(request: Request) {
  if (process.env.HARNESS_CHAOS !== "1") return new Response("set HARNESS_CHAOS=1 to arm crashes", { status: 404 });
  if (typeof authorize === "function") {
    try { await authorize(request); }
    catch (refusal) { if (refusal instanceof Response) return refusal; throw refusal; }
  } else if (authorize !== "public" && process.env.NODE_ENV === "production") return new Response("set CHAT_TOKEN or CHAT_PUBLIC=1 to arm crashes in production", { status: 401 });
  const { sessionId, at = "tool", afterMs = 500 } = await request.json() as { sessionId?: string; at?: "tool" | "any"; afterMs?: number };
  if (!sessionId) return new Response("sessionId is required", { status: 400 });
  const id = await agent.sessions.chaos(sessionId, { at, afterMs });
  return Response.json({ armed: id, at, afterMs });
}
