import { PIP_TIMINGS } from "./pip-timings";

/**
 * Decides when a knock chimes. Pure (time injected) so it is unit-tested:
 * - only a request id seen for the first time while `armed` (floating
 *   window open, or meeting tab hidden) chimes — people already waiting
 *   when that began do not, and a re-poll never chimes again;
 * - at most one chime per `CHIME_MIN_INTERVAL_MS`, however many knock.
 */
export class KnockTracker {
  private readonly seen = new Set<string>();
  private lastChime = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly minInterval = PIP_TIMINGS.CHIME_MIN_INTERVAL_MS,
  ) {}

  /** Feeds the current waiting ids; returns whether to chime now. */
  update(ids: readonly string[], armed: boolean, now: number): boolean {
    let isFresh = false;
    for (const id of ids) {
      if (this.seen.has(id)) continue;
      this.seen.add(id);
      if (armed) isFresh = true;
    }
    if (!isFresh || now - this.lastChime < this.minInterval) return false;
    this.lastChime = now;
    return true;
  }
}

const SOUND_KEY = "meetings.knockSound";

/** The per-viewer "Knock sound" setting; on unless turned off, storage or not. */
export function readKnockSound(storage: Pick<Storage, "getItem"> | undefined) {
  try {
    return storage?.getItem(SOUND_KEY) !== "off";
  } catch {
    return true;
  }
}

export function writeKnockSound(
  storage: Pick<Storage, "setItem"> | undefined,
  isOn: boolean,
) {
  try {
    storage?.setItem(SOUND_KEY, isOn ? "on" : "off");
  } catch {
    // Private mode or blocked storage: the choice lasts for this page only.
  }
}

let context: AudioContext | null = null;

/**
 * Creates / resumes the AudioContext. Must run inside a user gesture (the
 * room calls it on the first click or key press), or autoplay policy keeps
 * it suspended and the chime is silently skipped.
 */
export function unlockKnockAudio() {
  try {
    context ??= new AudioContext();
    if (context.state === "suspended") void context.resume();
  } catch {
    context = null;
  }
}

/** A short, soft two-tone "ding-dong", generated (no audio file). */
export function playKnockChime() {
  if (context?.state !== "running") return false;
  const start = context.currentTime;
  for (const [index, frequency] of [880, 660].entries()) {
    const at = start + index * 0.18;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.2, at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.35);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(at);
    oscillator.stop(at + 0.4);
  }
  return true;
}
