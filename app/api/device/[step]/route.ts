const DEVICE = "https://wallet.tempo.xyz/api/auth/device";

export async function POST(request: Request, context: { params: Promise<{ step: string }> }) {
  const { step } = await context.params;
  if (step !== "register" && step !== "token") return Response.json({ error: "unknown step" }, { status: 404 });
  const response = await fetch(DEVICE + "/" + step, { body: await request.text(), headers: { accept: "application/json", "content-type": "application/json" }, method: "POST" });
  return new Response(response.body, { headers: { "cache-control": "no-store", "content-type": response.headers.get("content-type") ?? "application/json" }, status: response.status });
}

