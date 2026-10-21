import type { NextConfig } from "next";
import { withDurableHarness } from "durable-harness/next";
import { basePath } from "./lib/base.ts";

const config: NextConfig = {
  basePath,
  redirects: async () => [{ basePath: false, destination: basePath, permanent: false, source: "/" }],
};

export default withDurableHarness(config, { agents: ["lib/agent.ts"] });
