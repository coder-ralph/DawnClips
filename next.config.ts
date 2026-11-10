import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    const common = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    ];
    return [
      {
        // Everything except the embeddable player cannot be framed by other sites.
        source: "/:path((?!embed/).*)",
        headers: [...common, { key: "X-Frame-Options", value: "DENY" }],
      },
      {
        // /embed/[id] is meant to be placed in an iframe on other sites (public clips only).
        source: "/embed/:id",
        headers: [...common, { key: "Content-Security-Policy", value: "frame-ancestors *" }],
      },
    ];
  },
};

export default nextConfig;
