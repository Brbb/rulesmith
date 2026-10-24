import type { NextConfig } from "next";
import path from "node:path";
const config: NextConfig = {
  turbopack: { root: path.resolve(process.cwd()) },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.POLICY_API_URL || "http://127.0.0.1:8080"}/api/:path*`,
      },
    ];
  },
};
export default config;
