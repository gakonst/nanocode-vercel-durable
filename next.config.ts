import type { NextConfig } from "next";
import { withDurableHarness } from "durable-harness/next";
import { basePath } from "./lib/base.ts";

const config: NextConfig = {
  assetPrefix: basePath,
  redirects: async () => [{ destination: basePath, permanent: false, source: "/" }],
  rewrites: async () => [{ destination: "/", source: basePath }, { destination: "/:path*", source: `${basePath}/:path*` }],
};

export default withDurableHarness(config, { agents: ["lib/agent.ts"] });
