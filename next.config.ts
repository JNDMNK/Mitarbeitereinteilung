import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ein einzelner Container: minimaler server.js inkl. benötigter node_modules
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  // Alles liegt hinter dem Login und ist dynamisch -> kein Cache-Components-Modell
  cacheComponents: false,
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
