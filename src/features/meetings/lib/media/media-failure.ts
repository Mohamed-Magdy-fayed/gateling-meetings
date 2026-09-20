/**
 * Why a camera or microphone could not be acquired, reduced to the handful
 * of causes a person can act on. Every path that touches `getUserMedia`
 * (lobby preview, room publish, device switch) funnels its error through
 * here so the message and the "how to fix it" hint are the same everywhere.
 */
export type MediaFailure =
  /** The site is blocked in the browser's permission prompt or settings. */
  | "denied"
  /** No device of that kind is plugged in / visible to the browser. */
  | "notFound"
  /** Another app (or tab) holds the device, or the OS refused to open it. */
  | "inUse"
  /** The remembered device can't satisfy the requested constraints. */
  | "constraints"
  | "other";

const DENIED = new Set([
  "NotAllowedError",
  "PermissionDeniedError",
  "SecurityError",
]);
const NOT_FOUND = new Set(["NotFoundError", "DevicesNotFoundError"]);
const IN_USE = new Set([
  "NotReadableError",
  "TrackStartError",
  "AbortError",
  "SourceUnavailableError",
]);
const CONSTRAINTS = new Set([
  "OverconstrainedError",
  "ConstraintNotSatisfiedError",
]);

export function classifyMediaError(error: unknown): MediaFailure {
  const name =
    typeof error === "object" && error !== null && "name" in error
      ? String((error as { name: unknown }).name)
      : "";
  if (DENIED.has(name)) return "denied";
  if (NOT_FOUND.has(name)) return "notFound";
  if (IN_USE.has(name)) return "inUse";
  if (CONSTRAINTS.has(name)) return "constraints";
  // Some browsers report a denial as a plain message.
  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error ?? "");
  if (message.includes("permission") || message.includes("denied")) {
    return "denied";
  }
  return "other";
}

/** True when the error came from a media device rather than, say, the SFU. */
export function isMediaError(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("name" in error)) {
    return false;
  }
  const name = String((error as { name: unknown }).name);
  return (
    DENIED.has(name) ||
    NOT_FOUND.has(name) ||
    IN_USE.has(name) ||
    CONSTRAINTS.has(name) ||
    name === "DeviceUnsupportedError"
  );
}

/**
 * Which family of browser we're in — the "unblock it" instructions differ
 * (padlock in the address bar vs. Safari's per-site menu vs. iOS Settings).
 */
export type BrowserFamily = "chromium" | "firefox" | "safari" | "other";

export function detectBrowserFamily(
  userAgent: string = typeof navigator === "undefined"
    ? ""
    : navigator.userAgent,
): BrowserFamily {
  const ua = userAgent.toLowerCase();
  if (ua.includes("firefox") || ua.includes("fxios")) return "firefox";
  if (
    ua.includes("chrome") ||
    ua.includes("crios") ||
    ua.includes("edg/") ||
    ua.includes("opr/") ||
    ua.includes("brave")
  ) {
    return "chromium";
  }
  if (ua.includes("safari") && ua.includes("apple")) return "safari";
  return "other";
}

export function isIOS(
  userAgent: string = typeof navigator === "undefined"
    ? ""
    : navigator.userAgent,
): boolean {
  return /iphone|ipad|ipod/i.test(userAgent);
}
