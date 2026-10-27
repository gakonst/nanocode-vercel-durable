import { installScript } from "nanocode-ts/install";

export function GET(): Response {
  return new Response(installScript(), { headers: { "cache-control": "public, max-age=300", "content-type": "text/plain; charset=utf-8" } });
}
