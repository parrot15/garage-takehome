import type { NextConfig } from "next";

const config: NextConfig = {
  poweredByHeader: false,
  // Next 16 blocks dev assets for any host except localhost; without this,
  // http://127.0.0.1:3000 renders but never hydrates. Ignored in production.
  allowedDevOrigins: ["127.0.0.1"],
  /** Applies security and referrer headers to every route. */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};
export default config;
