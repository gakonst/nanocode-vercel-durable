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
  serverExternalPackages: ["pyodide"],
  redirects: async () => [{ destination: basePath, permanent: false, source: "/" }],
  rewrites: async () => [{ destination: "/", source: basePath }, { destination: "/:path*", source: `${basePath}/:path*` }],
};

export default zyzz(withDurableHarness(config, { agents: ["lib/agent.ts"] }));
