/**
 * Paddle publishes the IPv4 addresses its webhooks come from at
 * `GET /ips` (`data.ipv4_cidrs`, /32s). Signature verification is what
 * actually authenticates a delivery; this is the outer wall — anything
 * not from Paddle is refused before we spend a database round-trip.
 *
 * The endpoint is the source of truth and can change, so the list is
 * fetched at runtime and cached per process: refreshed after `ttlMs`,
 * served stale up to `staleMs` if Paddle's endpoint is unreachable, and
 * "unknown" beyond that (the route answers 503 so Paddle retries).
 */

const HOUR_MS = 60 * 60 * 1000;

export const PADDLE_IPS_URL = {
  production: "https://api.paddle.com/ips",
  sandbox: "https://sandbox-api.paddle.com/ips",
} as const;

export type IpVerdict = "allowed" | "denied" | "unknown";

type IpListSnapshot = { cidrs: readonly string[]; fetchedAt: number };

type AllowlistOptions = {
  url: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
  ttlMs?: number;
  staleMs?: number;
};

/** `data.ipv4_cidrs` from the /ips response; throws on any other shape. */
export function parseIpsResponse(json: unknown): string[] {
  if (typeof json !== "object" || json === null) {
    throw new Error("Paddle /ips: response is not an object");
  }
  const data = (json as { data?: unknown }).data;
  const cidrs =
    typeof data === "object" && data !== null
      ? (data as { ipv4_cidrs?: unknown }).ipv4_cidrs
      : undefined;
  if (!Array.isArray(cidrs) || cidrs.length === 0) {
    throw new Error("Paddle /ips: data.ipv4_cidrs missing or empty");
  }
  const out = cidrs.filter((c): c is string => typeof c === "string");
  if (out.length !== cidrs.length) {
    throw new Error("Paddle /ips: non-string entry in ipv4_cidrs");
  }
  return out;
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = value * 256 + octet;
  }
  return value;
}

/** True when `ip` (IPv4, or IPv4-mapped IPv6) falls inside any CIDR. */
export function ipMatchesCidrs(ip: string, cidrs: readonly string[]): boolean {
  const normalized = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  const value = ipv4ToInt(normalized);
  if (value === null) return false;
  return cidrs.some((cidr) => {
    const [base, bitsRaw = "32"] = cidr.split("/");
    const baseValue = ipv4ToInt(base ?? "");
    const bits = Number(bitsRaw);
    if (baseValue === null || !Number.isInteger(bits) || bits < 0 || bits > 32)
      return false;
    if (bits === 0) return true;
    // Shift in unsigned space; `>>> 0` keeps the mask positive.
    const mask = (0xffffffff << (32 - bits)) >>> 0;
    return (value & mask) >>> 0 === (baseValue & mask) >>> 0;
  });
}

/**
 * The caller's address as the platform reports it. Vercel sets
 * `x-forwarded-for` (client first) and `x-real-ip` itself, so the
 * leftmost entry is trustworthy there; behind another proxy, make sure
 * it overwrites rather than appends.
 */
export function clientIpFromHeaders(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  if (first) return first;
  const real = headers.get("x-real-ip")?.trim();
  return real || null;
}

export function createPaddleIpAllowlist({
  url,
  fetchImpl = fetch,
  now = Date.now,
  ttlMs = HOUR_MS,
  staleMs = 24 * HOUR_MS,
}: AllowlistOptions) {
  let snapshot: IpListSnapshot | null = null;
  let inflight: Promise<IpListSnapshot> | null = null;

  async function refresh(): Promise<IpListSnapshot> {
    if (inflight) return inflight;
    inflight = (async () => {
      const response = await fetchImpl(url, {
        headers: { accept: "application/json" },
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(`Paddle /ips: HTTP ${response.status}`);
      }
      const next = {
        cidrs: parseIpsResponse(await response.json()),
        fetchedAt: now(),
      };
      snapshot = next;
      return next;
    })().finally(() => {
      inflight = null;
    });
    return inflight;
  }

  async function current(): Promise<IpListSnapshot | null> {
    const age = snapshot
      ? now() - snapshot.fetchedAt
      : Number.POSITIVE_INFINITY;
    if (snapshot && age < ttlMs) return snapshot;
    try {
      return await refresh();
    } catch (error) {
      console.warn("[paddle] could not refresh IP allowlist", error);
      // Stale is better than blind, up to a point.
      return snapshot && age < staleMs ? snapshot : null;
    }
  }

  return {
    async check(ip: string | null): Promise<IpVerdict> {
      if (!ip) return "denied";
      const list = await current();
      if (!list) return "unknown";
      return ipMatchesCidrs(ip, list.cidrs) ? "allowed" : "denied";
    },
  };
}

export type PaddleIpAllowlist = ReturnType<typeof createPaddleIpAllowlist>;
