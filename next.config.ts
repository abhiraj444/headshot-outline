import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  // transformers.js runs fully client-side (Web Worker). Stop webpack from trying to
  // bundle its Node-only backends.
  webpack: (config) => {
    config.resolve = config.resolve ?? {};
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      sharp$: false,
      "onnxruntime-node$": false,
    };
    config.resolve.fallback = { ...(config.resolve.fallback ?? {}), fs: false, path: false, url: false };
    return config;
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
