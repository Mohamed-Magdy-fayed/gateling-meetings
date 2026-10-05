import { PIP_TIMINGS } from "./pip-timings";

/** `knock`: someone new is waiting. `reminder`: they are still waiting. */
export type KnockCue = "knock" | "reminder" | null;

/**
 * Decides when a knock chimes. Pure (time injected) so it is unit-tested,
 * and fed on every poll and on a steady tick while anyone waits:
 * - only a request id seen for the first time while `armed` (the host is
 *   away: floating window open, tab hidden or unfocused) is "unseen" —
 *   people already waiting when that began do not chime;
 * - at most one chime per `CHIME_MIN_INTERVAL_MS`: a burst is one chime,
 *   and a knock that lands inside the gap is owed, not dropped;
 * - while unseen people still wait, a `reminder` every `KNOCK_REMINDER_MS`;
 * - the host looking back at the room (`armed` false) marks everyone seen.
 */
export class KnockTracker {
  private readonly seen = new Set<string>();
  private unseen = new Set<string>();
  private isOwed = false;
  private lastChime = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly minInterval: number = PIP_TIMINGS.CHIME_MIN_INTERVAL_MS,
    private readonly reminderInterval: number = PIP_TIMINGS.KNOCK_REMINDER_MS,
  ) {}

  /**
   * Feeds the current waiting ids. `hasNew`: an id never seen before (the
   * waiting strip flashes for it, chime or not).
   */
  update(
    ids: readonly string[],
    armed: boolean,
    now: number,
  ): { cue: KnockCue; hasNew: boolean } {
    let hasNew = false;
    for (const id of ids) {
      if (this.seen.has(id)) continue;
      this.seen.add(id);
      hasNew = true;
      if (armed) {
        this.unseen.add(id);
        this.isOwed = true;
      }
    }
    // Admitted, denied or gone: nobody to chime for any more.
    this.unseen = armed
      ? new Set(ids.filter((id) => this.unseen.has(id)))
      : new Set();
    if (this.unseen.size === 0) this.isOwed = false;
    if (this.unseen.size === 0) return { cue: null, hasNew };

    const sinceChime = now - this.lastChime;
    if (this.isOwed && sinceChime >= this.minInterval) {
      this.isOwed = false;
      this.lastChime = now;
      return { cue: "knock", hasNew };
    }
    if (!this.isOwed && sinceChime >= this.reminderInterval) {
      this.lastChime = now;
      return { cue: "reminder", hasNew };
    }
    return { cue: null, hasNew };
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
