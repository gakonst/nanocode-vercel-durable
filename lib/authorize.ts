const token = process.env.CHAT_TOKEN;

export const isPublic = !token && process.env.CHAT_PUBLIC === "1";

export const MAX_PROMPT_CHARACTERS = 2000;

export const MAX_PROMPTS_PER_SESSION = 20;

export const authorize = token
  ? async (request: Request) => {
    if (request.headers.get("authorization") !== `Bearer ${token}`) throw new Response("unauthorized", { status: 401 });
  }
  : isPublic ? "public" as const : undefined;
