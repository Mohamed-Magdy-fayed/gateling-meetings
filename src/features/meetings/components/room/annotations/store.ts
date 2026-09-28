import {
  type Annotation,
  createRateLimiter,
  LASER_FADE_MS,
  LASER_SAMPLES_MAX,
  LOSSY_KINDS,
  POINTS_FLUSH_MS,
  type Point,
  STROKES_PER_SENDER,
} from "../protocol";

/**
 * Everyone's ink, per screen share. Pure (no React, no LiveKit): the room
 * hook feeds it decoded messages and the SFU-reported sender, and the
 * overlay renders its snapshots. Ownership is structural — a stroke's key
 * is `${owner}:${strokeId}`, so a message can only ever reach the sender's
 * own strokes. See protocol.ts for the rules this enforces.
 */

export type Stroke = {
  key: string;
  owner: string;
  id: string;
  points: readonly Point[];
  ended: boolean;
};

export type Laser = {
  owner: string;
  name: string;
  /** Recent positions, oldest first, for the fading trail. */
  trail: readonly { at: Point; t: number }[];
};

export type ShareSnapshot = {
  strokes: readonly Stroke[];
  lasers: readonly Laser[];
  /** Set when a pause wiped the ink; cleared by the next ink. */
  clearedByPause: boolean;
};

export const EMPTY_SNAPSHOT: ShareSnapshot = {
  strokes: [],
  lasers: [],
  clearedByPause: false,
};

export type DropReason =
  | "share"
  | "rate-limit"
  | "setting-off"
  | "not-host"
  | "ordering"
  | "unknown-stroke";

export type ApplyContext = {
  sender: string;
  senderName: string;
  hostIdentity: string | null;
  /** Room setting; the host's own ink is exempt. */
  allowAnnotations: boolean;
  now: number;
  /** Local echo skips the rate limit (it is our own input). */
  isLocal?: boolean;
};

/** Two flushes' worth of samples, so the trail spans the replay delay. */
const TRAIL_LENGTH = LASER_SAMPLES_MAX * 2;

type TrailEntry = Laser["trail"][number];

/**
 * A laser message as trail entries. With `samples`, positions are replayed
 * on the receiver's clock (spaced as they were drawn, starting now or where
 * the previous batch ends), which turns 40 ms jumps into movement. Without
 * them (older clients) it is the single `at` point, now.
 */
function laserEntries(
  message: Extract<Annotation, { kind: "laser" }>,
  now: number,
  lastT: number | undefined,
): TrailEntry[] {
  const samples = message.samples;
  if (!samples) return [{ at: message.at, t: now }];
  // Never schedule behind the previous batch, never lag by more than a flush.
  const start = Math.min(Math.max(now, lastT ?? now), now + POINTS_FLUSH_MS);
  const first = samples[0]?.[2] ?? 0;
  return samples.map(([x, y, dt]) => ({ at: [x, y], t: start + dt - first }));
}

/**
 * What to draw at `now`: the trail entries already due, and the head
 * interpolated toward the next scheduled entry. Null when nothing is due.
 */
export function laserFrame(
  trail: readonly TrailEntry[],
  now: number,
): { head: Point; headT: number; due: readonly TrailEntry[] } | null {
  let index = -1;
  for (let i = 0; i < trail.length; i++) {
    if ((trail[i] as TrailEntry).t <= now) index = i;
  }
  if (index === -1) return null;
  const due = trail.slice(0, index + 1);
  const a = trail[index] as TrailEntry;
  const b = trail[index + 1];
  if (!b || b.t <= a.t) return { head: a.at, headT: a.t, due };
  const f = Math.min(1, (now - a.t) / (b.t - a.t));
  return {
    head: [
      a.at[0] + (b.at[0] - a.at[0]) * f,
      a.at[1] + (b.at[1] - a.at[1]) * f,
    ],
    headT: now,
    due,
  };
}

class ShareInk {
  strokes = new Map<string, Stroke>();
  /** Per owner, stroke keys in creation order (for undo and the cap). */
  byOwner = new Map<string, string[]>();
  /** Keys that ended or were undone: later lossy `points` are ignored. */
  closed = new Set<string>();
  lasers = new Map<string, Laser>();
  clearedByPause = false;
  snapshot: ShareSnapshot = EMPTY_SNAPSHOT;
  dirty = false;
}

export class AnnotationStore {
  private shares = new Map<string, ShareInk>();
  private limiter = createRateLimiter();
  private listeners = new Set<() => void>();
  private version = 0;

  /** Only shares currently published in the room accept ink. */
  setPublishedShares(shareSids: Iterable<string>) {
    const next = new Set(shareSids);
    let changed = false;
    for (const sid of this.shares.keys()) {
      if (!next.has(sid)) {
        this.shares.delete(sid);
        changed = true;
      }
    }
    for (const sid of next) {
      if (!this.shares.has(sid)) {
        this.shares.set(sid, new ShareInk());
        changed = true;
      }
    }
    if (changed) this.emit();
  }

  /** Applies one message; returns why it was dropped, or null. */
  apply(message: Annotation, ctx: ApplyContext): DropReason | null {
    const ink = this.shares.get(message.shareSid);
    if (!ink) return "share";
    const isHost = ctx.hostIdentity != null && ctx.sender === ctx.hostIdentity;
    if (!ctx.isLocal && LOSSY_KINDS.has(message.kind)) {
      if (!this.limiter.take(ctx.sender, ctx.now)) return "rate-limit";
    }
    if (!isHost && !ctx.allowAnnotations) return "setting-off";

    switch (message.kind) {
      case "laser": {
        const current = ink.lasers.get(ctx.sender);
        const trail = [
          ...(current?.trail ?? []).filter(
            (entry) => ctx.now - entry.t < LASER_FADE_MS,
          ),
          ...laserEntries(message, ctx.now, current?.trail.at(-1)?.t),
        ].slice(-TRAIL_LENGTH);
        ink.lasers.set(ctx.sender, {
          owner: ctx.sender,
          name: ctx.senderName,
          trail,
        });
        break;
      }
      case "points": {
        const key = `${ctx.sender}:${message.strokeId}`;
        if (ink.closed.has(key)) return "ordering";
        const existing = ink.strokes.get(key);
        if (existing) {
          ink.strokes.set(key, {
            ...existing,
            points: [...existing.points, ...message.points],
          });
        } else {
          this.addStroke(ink, {
            key,
            owner: ctx.sender,
            id: message.strokeId,
            points: message.points,
            ended: false,
          });
        }
        break;
      }
      case "stroke-end": {
        const key = `${ctx.sender}:${message.strokeId}`;
        if (ink.closed.has(key)) return "ordering";
        ink.closed.add(key);
        const stroke: Stroke = {
          key,
          owner: ctx.sender,
          id: message.strokeId,
          points: message.points,
          ended: true,
        };
        if (ink.strokes.has(key)) ink.strokes.set(key, stroke);
        else this.addStroke(ink, stroke);
        break;
      }
      case "undo": {
        const key = `${ctx.sender}:${message.strokeId}`;
        ink.closed.add(key);
        if (!ink.strokes.has(key)) return "unknown-stroke";
        this.removeStroke(ink, key);
        break;
      }
      case "clear":
        this.clearOwner(ink, ctx.sender);
        break;
      case "clear-all":
        if (!isHost) return "not-host";
        this.resetInk(ink);
        break;
    }
    if (message.kind !== "clear" && message.kind !== "clear-all") {
      ink.clearedByPause = false;
    }
    this.touch(ink);
    return null;
  }

  /** Pause: the share's ink is gone for everyone (no message needed). */
  clearForPause(shareSid: string) {
    const ink = this.shares.get(shareSid);
    if (!ink) return;
    const hadInk = ink.strokes.size > 0 || ink.lasers.size > 0;
    this.resetInk(ink);
    ink.clearedByPause = hadInk || ink.clearedByPause;
    this.touch(ink);
  }

  /** The room turned annotations off: everyone's ink but the host's goes. */
  removeNonHost(hostIdentity: string | null) {
    for (const ink of this.shares.values()) {
      for (const owner of [...ink.byOwner.keys()]) {
        if (owner !== hostIdentity) this.clearOwner(ink, owner);
      }
      for (const owner of [...ink.lasers.keys()]) {
        if (owner !== hostIdentity) ink.lasers.delete(owner);
      }
      this.touch(ink);
    }
  }

  /** Drops laser pointers that have fully faded. Returns whether any remain. */
  expireLasers(now: number): boolean {
    let remaining = false;
    for (const ink of this.shares.values()) {
      for (const [owner, laser] of ink.lasers) {
        const last = laser.trail.at(-1);
        if (!last || now - last.t >= LASER_FADE_MS) {
          ink.lasers.delete(owner);
          this.touch(ink);
        } else {
          remaining = true;
        }
      }
    }
    return remaining;
  }

  /** The owner's most recent stroke on a share (what "Undo" removes). */
  lastStrokeOf(shareSid: string, owner: string): string | null {
    const keys = this.shares.get(shareSid)?.byOwner.get(owner);
    const key = keys?.at(-1);
    return key
      ? (this.shares.get(shareSid)?.strokes.get(key)?.id ?? null)
      : null;
  }

  /** Distinct people other than `except` with ink or a laser on the share. */
  annotators(shareSid: string, except: string): number {
    const ink = this.shares.get(shareSid);
    if (!ink) return 0;
    const owners = new Set<string>();
    for (const [owner, keys] of ink.byOwner) {
      if (keys.length > 0) owners.add(owner);
    }
    for (const owner of ink.lasers.keys()) owners.add(owner);
    owners.delete(except);
    return owners.size;
  }

  snapshot(shareSid: string): ShareSnapshot {
    const ink = this.shares.get(shareSid);
    if (!ink) return EMPTY_SNAPSHOT;
    if (ink.dirty) {
      ink.snapshot = {
        strokes: [...ink.strokes.values()],
        lasers: [...ink.lasers.values()],
        clearedByPause: ink.clearedByPause,
      };
      ink.dirty = false;
    }
    return ink.snapshot;
  }

  getVersion = () => this.version;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private addStroke(ink: ShareInk, stroke: Stroke) {
    ink.strokes.set(stroke.key, stroke);
    const keys = [...(ink.byOwner.get(stroke.owner) ?? []), stroke.key];
    // Silent eviction of the owner's oldest stroke at the cap.
    while (keys.length > STROKES_PER_SENDER) {
      const oldest = keys.shift();
      if (oldest) {
        ink.strokes.delete(oldest);
        ink.closed.add(oldest);
      }
    }
    ink.byOwner.set(stroke.owner, keys);
  }

  private removeStroke(ink: ShareInk, key: string) {
    const stroke = ink.strokes.get(key);
    ink.strokes.delete(key);
    if (!stroke) return;
    const keys = ink.byOwner.get(stroke.owner) ?? [];
    ink.byOwner.set(
      stroke.owner,
      keys.filter((candidate) => candidate !== key),
    );
  }

  private clearOwner(ink: ShareInk, owner: string) {
    for (const key of ink.byOwner.get(owner) ?? []) {
      ink.strokes.delete(key);
      ink.closed.add(key);
    }
    ink.byOwner.delete(owner);
    ink.lasers.delete(owner);
  }

  private resetInk(ink: ShareInk) {
    for (const key of ink.strokes.keys()) ink.closed.add(key);
    ink.strokes.clear();
    ink.byOwner.clear();
    ink.lasers.clear();
  }

  private touch(ink: ShareInk) {
    ink.dirty = true;
    this.emit();
  }

  private emit() {
    this.version++;
    for (const listener of this.listeners) listener();
  }
}
