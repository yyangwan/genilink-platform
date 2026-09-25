import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  output: "standalone",
  deploymentId: process.env.DEPLOYMENT_VERSION,
  // remediation §4.11: `tsc --noEmit` is green — build-time type errors are no
  // longer ignored. `npx tsc --noEmit` must stay in the CI chain.
  typescript: {
    ignoreBuildErrors: false,
  },
  experimental: {
    // Avoid one static-generation process per logical CPU on high-core builders.
    cpus: 4,
  },
};

export default nextConfig;
