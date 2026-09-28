import { z } from "zod";

/**
 * Wire protocol for the two data-channel topics added for presenting:
 * host requests and annotations. Pure (no React, no LiveKit) so it is
 * unit-tested directly; every limit is a named constant the code and the
 * tests share.
 *
 * ## `host-request` (reliable, targeted with `destinationIdentities`)
 * Sent by the host's browser only. Receivers act on a message only when the
 * SFU-reported sender identity equals the server-reported host identity
 * (`useHostIdentity()`); a packet with no sender (server-sent) is not the
 * host either.
 * - `ask-unmute` / `ask-camera`: a prompt the person may accept or ignore.
 *   Declined asks are never reported to the host, by design.
 * - `notice-muted` / `notice-camera-off` / `notice-hand-lowered` /
 *   `notice-muted-all`: tells the person the host did it. livekit-client
 *   applies a server mute through the same path as a local one, so without
 *   this the person could not tell who muted them.
 *
 * ## `annotation` (broadcast)
 * Every message names the screen share it draws on (`shareSid`). Kinds:
 * - `laser` (lossy): the pointer position; not sent when unchanged.
 * - `points` (lossy): a batch of a stroke's new points, flushed every
 *   `POINTS_FLUSH_MS`.
 * - `stroke-end` (reliable): the whole simplified stroke, which replaces
 *   whatever `points` arrived — this is what heals dropped lossy packets.
 * - `undo` (reliable): removes one of the sender's own strokes.
 * - `clear` (reliable): removes all the sender's own ink on that share.
 * - `clear-all` (reliable): honoured only from the host identity.
 *
 * Receiver rules: strokes are keyed by sender identity + stroke id, so a
 * peer can only ever touch their own ink; `points` for an ended or undone
 * stroke are ignored (the lossy and reliable channels are not ordered
 * against each other); messages for a share that is not published are
 * dropped; non-host ink is dropped while the room's `allowAnnotations` is
 * off; lossy kinds pass a per-sender token bucket.
 *
 * Accepted risks: the data-channel grant is shared with chat and
 * reactions, so a modified client can still send — receivers bound the
 * damage (schema, caps, rate limit, ownership). No replay for late joiners;
 * eviction at the per-sender stroke cap is silent.
 */

export const PROTOCOL_VERSION = 1;
export const HOST_REQUEST_TOPIC = "host-request";
export const ANNOTATION_TOPIC = "annotation";

// Host requests
export const ASK_THROTTLE_MS = 10_000;
export const PROMPT_DISMISS_MS = 30_000;
export const RESIDUAL_BADGE_MS = 120_000;
export const PENDING_TIMEOUT_MS = 5_000;
export const ERROR_CLEAR_MS = 6_000;

// Annotations
export const COORDINATE_DECIMALS = 4;
export const POINTS_PER_BATCH = 32;
export const POINTS_FLUSH_MS = 40;
export const POINTS_MESSAGE_MAX_BYTES = 1_200;
export const RDP_TOLERANCE = 0.002;
export const STROKE_MAX_POINTS = 400;
export const MESSAGE_MAX_BYTES = 12 * 1024;
export const STROKES_PER_SENDER = 50;
export const LASER_FADE_MS = 1_500;
/** Pen input keeps a point only this far (normalized) from the last kept one. */
export const THIN_MIN_DISTANCE = 0.002;
/** Laser positions sampled between two flushes, replayed by the receiver. */
export const LASER_SAMPLES_MAX = 8;
/** Lossy kinds only: burst 2x and refill 1.5x the per-second flush rate. */
export const BUCKET_REFILL_PER_SECOND = (1_000 / POINTS_FLUSH_MS) * 1.5;
export const BUCKET_BURST = (1_000 / POINTS_FLUSH_MS) * 2;

const version = z.literal(PROTOCOL_VERSION);

export const hostRequestKinds = [
  "ask-unmute",
  "ask-camera",
  "notice-muted",
  "notice-camera-off",
  "notice-hand-lowered",
  "notice-muted-all",
] as const;
export type HostRequestKind = (typeof hostRequestKinds)[number];

export const hostRequestSchema = z.object({
  v: version,
  kind: z.enum(hostRequestKinds),
});
export type HostRequest = z.infer<typeof hostRequestSchema>;

/** Rounded to `COORDINATE_DECIMALS` and clamped to 0..1; NaN becomes 0. */
export function normalizeCoordinate(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** COORDINATE_DECIMALS;
  return Math.round(Math.min(1, Math.max(0, value)) * factor) / factor;
}

const coordinate = z.number().transform(normalizeCoordinate);
/** `[x, y]` in video-frame space, 0..1 from the frame's top-left corner. */
const point = z.tuple([coordinate, coordinate]);
export type Point = [number, number];

const shareSid = z.string().min(1).max(64);
const strokeId = z.string().min(1).max(64);

/** `[x, y, dtMs]`: a laser position and its time after the batch's first sample. */
const laserSample = z.tuple([
  coordinate,
  coordinate,
  z.number().int().min(0).max(1_000),
]);
export type LaserSample = [number, number, number];

export const annotationSchema = z.discriminatedUnion("kind", [
  z.object({
    v: version,
    kind: z.literal("laser"),
    shareSid,
    at: point,
    // Optional so older clients' single-point messages still decode.
    samples: z.array(laserSample).min(1).max(LASER_SAMPLES_MAX).optional(),
  }),
  z.object({
    v: version,
    kind: z.literal("points"),
    shareSid,
    strokeId,
    points: z.array(point).min(1).max(POINTS_PER_BATCH),
  }),
  z.object({
    v: version,
    kind: z.literal("stroke-end"),
    shareSid,
    strokeId,
    points: z.array(point).min(1).max(STROKE_MAX_POINTS),
  }),
  z.object({ v: version, kind: z.literal("undo"), shareSid, strokeId }),
  z.object({ v: version, kind: z.literal("clear"), shareSid }),
  z.object({ v: version, kind: z.literal("clear-all"), shareSid }),
]);
export type Annotation = z.infer<typeof annotationSchema>;

export const LOSSY_KINDS: ReadonlySet<Annotation["kind"]> = new Set([
  "laser",
  "points",
]);

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function encodeMessage(message: object): Uint8Array<ArrayBuffer> {
  return encoder.encode(JSON.stringify(message));
}

export type DecodeFailure = "size" | "json" | "version" | "schema";

/**
 * Cheap checks first (byte size, JSON, version) so junk never reaches zod.
 * Returns the parsed message or why it was dropped.
 */
function decode<T>(
  payload: Uint8Array,
  schema: z.ZodType<T>,
): { ok: true; value: T } | { ok: false; reason: DecodeFailure } {
  if (payload.byteLength > MESSAGE_MAX_BYTES) {
    return { ok: false, reason: "size" };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(decoder.decode(payload));
  } catch {
    return { ok: false, reason: "json" };
  }
  if (
    !raw ||
    typeof raw !== "object" ||
    (raw as { v?: unknown }).v !== PROTOCOL_VERSION
  ) {
    return { ok: false, reason: "version" };
  }
  const parsed = schema.safeParse(raw);
  return parsed.success
    ? { ok: true, value: parsed.data }
    : { ok: false, reason: "schema" };
}

export function decodeAnnotation(payload: Uint8Array) {
  return decode(payload, annotationSchema);
}

export function decodeHostRequest(payload: Uint8Array) {
  return decode(payload, hostRequestSchema);
}

/**
 * A host request counts only when the SFU says it came from the host.
 * A server-sent packet (no sender) or an unknown host is refused.
 */
export function isFromHost(
  senderIdentity: string | undefined,
  hostIdentity: string | null,
): boolean {
  return senderIdentity != null && hostIdentity != null
    ? senderIdentity === hostIdentity
    : false;
}

/** Ramer-Douglas-Peucker: drops points closer than `tolerance` to the line. */
export function simplify(points: Point[], tolerance = RDP_TOLERANCE): Point[] {
  if (points.length < 3) return points.slice();
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [start, end] = stack.pop() as [number, number];
    const [ax, ay] = points[start] as Point;
    const [bx, by] = points[end] as Point;
    const dx = bx - ax;
    const dy = by - ay;
    const length = Math.hypot(dx, dy);
    let farthest = -1;
    let farthestDistance = tolerance;
    for (let i = start + 1; i < end; i++) {
      const [px, py] = points[i] as Point;
      const distance =
        length === 0
          ? Math.hypot(px - ax, py - ay)
          : Math.abs(dy * px - dx * py + bx * ay - by * ax) / length;
      if (distance > farthestDistance) {
        farthest = i;
        farthestDistance = distance;
      }
    }
    if (farthest !== -1) {
      keep[farthest] = true;
      stack.push([start, farthest], [farthest, end]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/**
 * Appends to a stroke only the `next` points at least `THIN_MIN_DISTANCE`
 * from the last kept one. Returns just the newly kept points, so the same
 * list feeds the local echo, the `points` batches and `stroke-end`.
 */
export function thinPoints(
  last: Point | undefined,
  next: readonly Point[],
  minDistance = THIN_MIN_DISTANCE,
): Point[] {
  const kept: Point[] = [];
  let anchor = last;
  for (const candidate of next) {
    if (
      anchor &&
      Math.hypot(candidate[0] - anchor[0], candidate[1] - anchor[1]) <
        minDistance
    ) {
      continue;
    }
    kept.push(candidate);
    anchor = candidate;
  }
  return kept;
}

/**
 * The stroke as sent in `stroke-end`. A stroke within the cap goes as drawn
 * (already thinned), so the final shape equals the live one; a longer one is
 * simplified, then capped.
 */
export function finishStroke(points: Point[]): Point[] {
  if (points.length <= STROKE_MAX_POINTS) return points.slice();
  const simplified = simplify(points);
  if (simplified.length <= STROKE_MAX_POINTS) return simplified;
  // Still too long: keep evenly spaced points, always including the ends.
  const step = (simplified.length - 1) / (STROKE_MAX_POINTS - 1);
  return Array.from(
    { length: STROKE_MAX_POINTS },
    (_, i) => simplified[Math.round(i * step)] as Point,
  );
}

/**
 * A per-sender token bucket. `take` returns false when the sender is over
 * budget. Time is injected so tests don't sleep.
 */
export function createRateLimiter(
  burst = BUCKET_BURST,
  refillPerSecond = BUCKET_REFILL_PER_SECOND,
) {
  const buckets = new Map<string, { tokens: number; at: number }>();
  return {
    take(sender: string, now: number): boolean {
      const bucket = buckets.get(sender) ?? { tokens: burst, at: now };
      const tokens = Math.min(
        burst,
        bucket.tokens + ((now - bucket.at) / 1_000) * refillPerSecond,
      );
      if (tokens < 1) {
        buckets.set(sender, { tokens, at: now });
        return false;
      }
      buckets.set(sender, { tokens: tokens - 1, at: now });
      return true;
    },
    forget(sender: string) {
      buckets.delete(sender);
    },
  };
}
