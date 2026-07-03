import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '100mb',
    },
    workerThreads: true,
  },
  outputFileTracingIncludes: {
    '/api/upload': ['./node_modules/sharp/**/*', './node_modules/@img/**/*'],
    '/api/images/*/duplicate': ['./node_modules/sharp/**/*', './node_modules/@img/**/*'],
  },
};

export default nextConfig;
