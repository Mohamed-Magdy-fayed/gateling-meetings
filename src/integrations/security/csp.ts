/**
 * The app's Content-Security-Policy, built per request.
 *
 * Pure and dependency-free so the policy is unit-testable — `proxy.ts` is the
 * only caller, and a policy that can only be checked by loading a browser is a
 * policy nobody checks.
 */

/**
 * Remote hosts the browser is allowed to load images from.
 *
 * - `lh3.googleusercontent.com` serves the profile pictures Google hands back
 *   with an OAuth sign-in, which `users.imageUrl` stores verbatim.
 *
 * Listed explicitly rather than as a blanket `https:` so a future third-party
 * image host is a deliberate edit here, not something that silently works.
 */
const IMAGE_HOSTS = ["https://lh3.googleusercontent.com"] as const;

export type CspOptions = {
  nonce: string;
  /** `true` in `next dev`, which needs allowances production must not have. */
  isDevelopment: boolean;
  /**
   * The LiveKit signalling endpoint (`LIVEKIT_URL`). The client SDK opens a
   * WebSocket to it and calls its `/rtc/validate` HTTPS endpoint on failure,
   * so both the `ws(s)://` and `http(s)://` forms of the origin are allowed.
   * Media itself rides WebRTC, which CSP does not govern.
   */
  liveKitUrl?: string;
};

/** `wss://x.livekit.cloud` → `["wss://x.livekit.cloud", "https://x.livekit.cloud"]`. */
function liveKitOrigins(liveKitUrl: string | undefined): string[] {
  if (!liveKitUrl) return [];
  let parsed: URL;
  try {
    parsed = new URL(liveKitUrl);
  } catch {
    return [];
  }
  const isSecure = parsed.protocol === "wss:" || parsed.protocol === "https:";
  return [
    `${isSecure ? "wss" : "ws"}://${parsed.host}`,
    `${isSecure ? "https" : "http"}://${parsed.host}`,
  ];
}

/**
 * Directive choices worth stating, since the loose-looking ones are deliberate:
 *
 * - `script-src` is strict: nonce + `strict-dynamic`, no `unsafe-inline`.
 *   Next injects the nonce into its own framework and page bundles;
 *   `layout.tsx` passes it to next-themes' inline script.
 * - `style-src` keeps `'unsafe-inline'`. Base UI and Radix set inline `style`
 *   attributes on nearly every popover, dialog and tooltip for positioning, and
 *   a style *attribute* cannot carry a nonce. Inline styles are not an
 *   execution vector once `script-src` is strict.
 * - `worker-src blob:` — LiveKit's track processors (background blur) and the
 *   E2EE worker are spawned from blob URLs.
 * - `media-src blob:` — a screen-share preview or a recorded clip is played
 *   from an in-memory blob.
 * - `'unsafe-eval'` in development only: React uses `eval` to rebuild
 *   server-side error stacks in the browser. Production never gets it.
 * - `upgrade-insecure-requests` is production-only — it would break
 *   `http://localhost:3000`.
 * - `frame-src` is `'none'`: payment pages are hosted by the provider and
 *   opened as a top-level navigation, never framed; `frame-ancestors`
 *   stays `'none'` everywhere too.
 * - `frame-ancestors 'none'` is the real clickjacking control; the
 *   `X-Frame-Options` header in `next.config.ts` is its legacy twin.
 */
export function buildContentSecurityPolicy({
  nonce,
  isDevelopment,
  liveKitUrl,
}: CspOptions): string {
  const scriptSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    isDevelopment ? "'unsafe-eval'" : null,
  ].filter(Boolean);

  const connectSrc = ["'self'", ...liveKitOrigins(liveKitUrl)];
  // `next dev` streams HMR updates over a WebSocket to its own origin.
  if (isDevelopment) connectSrc.push("ws://localhost:*", "wss://localhost:*");

  const directives: [string, string][] = [
    ["default-src", "'self'"],
    ["script-src", scriptSrc.join(" ")],
    ["style-src", "'self' 'unsafe-inline'"],
    ["img-src", `'self' data: blob: ${IMAGE_HOSTS.join(" ")}`],
    ["font-src", "'self'"],
    ["connect-src", connectSrc.join(" ")],
    ["media-src", "'self' blob:"],
    ["worker-src", "'self' blob:"],
    ["frame-src", "'none'"],
    ["object-src", "'none'"],
    ["base-uri", "'self'"],
    ["form-action", "'self'"],
    ["frame-ancestors", "'none'"],
  ];

  if (!isDevelopment) {
    directives.push(["upgrade-insecure-requests", ""]);
  }

  return directives
    .map(([name, value]) => (value ? `${name} ${value}` : name))
    .join("; ");
}

/**
 * A fresh, unguessable nonce per request — the whole point of a nonce is that
 * an injected script can't predict it, so this must never be cached, reused
 * across requests, or derived from anything about the request.
 */
export function createCspNonce(): string {
  return crypto.randomUUID().replaceAll("-", "");
}
