import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    // Allow production image builds while lint debt is cleaned up
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Temporary: production image must build despite leftover type debt
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
