import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  allowedDevOrigins: [
    "preview-590dd7b5-1e67-4290-99e8-b92fae037b97.space.chatglm.site",
  ],
};

export default nextConfig;
