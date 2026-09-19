import type { NextConfig } from "next";

/**
 * Static security headers.
 *
 * Content-Security-Policy is deliberately **not** here — it carries a
 * per-request nonce and is set in `src/proxy.ts` (see
 * `src/integrations/security/csp.ts`). Everything below is request-independent,
 * so it belongs in the static header config where it also covers the routes the
 * proxy's matcher skips (`/api/*`, static assets).
 */
const securityHeaders = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // A meeting app *is* the camera and the microphone. `self` keeps those
  // grants to our own origin (no embedded third party can ask on our behalf);
  // `display-capture` is screen share. Everything else stays denied.
  {
    key: "Permissions-Policy",
    value:
      "camera=(self), microphone=(self), display-capture=(self), geolocation=(), payment=(self), usb=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // The developer docs are read from `docs/` at request time (MCP tools,
  // resources and the in-app docs page); make sure the deploy carries them.
  outputFileTracingIncludes: {
    "/api/mcp": ["./docs/*.md"],
    "/settings/integrations/docs": ["./docs/*.md"],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
