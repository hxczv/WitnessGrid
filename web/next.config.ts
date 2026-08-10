import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";
import { serwistOptions } from "./serwist.config";

const withSerwist = withSerwistInit(serwistOptions);

function originOf(value: string | undefined, fallback: string): string {
  try {
    const normalized = value?.replace("{z}", "0").replace("{x}", "0").replace("{y}", "0");
    return new URL(normalized || fallback).origin;
  } catch {
    return new URL(fallback).origin;
  }
}

// hosts() runs in the server process at startup, so the CSP reflects the
// configured API and tile origins rather than hardcoded dev values.
async function securityHeaders() {
  const apiOrigin = originOf(
    process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL,
    "http://localhost:8787",
  );
  const tileOrigin = originOf(
    process.env.NEXT_PUBLIC_MAP_TILES_URL,
    "https://basemaps.cartocdn.com",
  );
  const glyphOrigin = "https://protomaps.github.io";

  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    `font-src 'self' https://fonts.gstatic.com data: ${glyphOrigin}`,
    `img-src 'self' data: blob: ${apiOrigin} ${tileOrigin}`,
    `media-src 'self' blob: mediastream: ${apiOrigin}`,
    `connect-src 'self' ${apiOrigin} ${tileOrigin} ${glyphOrigin}`,
    "worker-src 'self' blob:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");

  return [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(self)" },
    // Enforced in production builds only; the dev server's HMR websocket
    // would otherwise be blocked by connect-src.
    ...(process.env.NODE_ENV === "production"
      ? [{ key: "Content-Security-Policy", value: csp }]
      : []),
  ];
}

const nextConfig: NextConfig = {
  transpilePackages: ["@witnessgrid/contract"],
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: await securityHeaders(),
      },
    ];
  },
};

export default withSerwist(nextConfig);
