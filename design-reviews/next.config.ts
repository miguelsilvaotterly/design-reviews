import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: { unoptimized: true },
  experimental: { serverActions: { bodySizeLimit: "20mb" } },
  // The one-time seed route reads the handoff content at runtime on Vercel.
  outputFileTracingIncludes: { "/api/seed": ["./docs/handoff/data/**/*"] },
};

export default nextConfig;
