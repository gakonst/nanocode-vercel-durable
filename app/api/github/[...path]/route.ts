const NAME = /^[\w.-]+$/;

export async function GET(_request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const [owner, repo, ...ref] = path;
  if (!owner || !repo || !ref.length || !NAME.test(owner) || !NAME.test(repo)) return Response.json({ error: "use /api/github/OWNER/REPO/REF" }, { status: 404 });
  const upstream = await fetch("https://codeload.github.com/" + owner + "/" + repo + "/tar.gz/" + ref.map(encodeURIComponent).join("/"), { headers: { "user-agent": "nanocode-vercel-durable" } });
  return new Response(upstream.body, { headers: { "cache-control": "public, max-age=300", "content-type": upstream.headers.get("content-type") ?? "application/x-gzip" }, status: upstream.status });
}

