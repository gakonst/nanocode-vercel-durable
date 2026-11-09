import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { NextConfig } from "next";
import { withDurableHarness } from "durable-harness/next";
import { zyzz } from "zyzz/next";
import { basePath } from "./lib/base.ts";

const config: NextConfig = {
  assetPrefix: basePath,
  env: { NANOCODE_WASM_HASH: createHash("sha256").update(readFileSync("node_modules/nanocode-ts/dist/nanocode_wasm.wasm")).digest("hex").slice(0, 20) },
  outputFileTracingIncludes: { "/**": ["./node_modules/pyodide/**"] },
  serverExternalPackages: ["ondine", "pyodide"],
  redirects: async () => [{ destination: basePath, permanent: false, source: "/" }],
  rewrites: async () => [
    { destination: "/", missing: [{ key: "theme", type: "query" }], source: basePath },
    { destination: "/", has: [{ key: "theme", type: "query", value: "nanocode" }], source: basePath },
    { destination: "/chatgpt", has: [{ key: "theme", type: "query", value: "codex" }], source: basePath },
    { destination: "/claude", has: [{ key: "theme", type: "query", value: "claude" }], source: basePath },
    { destination: "/themes/unknown", has: [{ key: "theme", type: "query" }], source: basePath },
    { destination: "/:path*", source: `${basePath}/:path*` },
  ],
};

export default zyzz(withDurableHarness(config, { agents: ["lib/agent.ts"] }));
