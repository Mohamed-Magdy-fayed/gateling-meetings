import { describe, expect, test } from "vitest";

import {
  KnockTracker,
  readKnockSound,
  writeKnockSound,
} from "@/features/meetings/components/room/knock-chime";
import { PIP_TIMINGS } from "@/features/meetings/components/room/pip-timings";

describe("KnockTracker", () => {
  const cue = (
    tracker: KnockTracker,
    ids: string[],
    armed: boolean,
    now: number,
  ) => tracker.update(ids, armed, now).cue;
  const gap = PIP_TIMINGS.CHIME_MIN_INTERVAL_MS;
  const reminder = PIP_TIMINGS.KNOCK_REMINDER_MS;

  test("people already waiting when the host looked away do not chime", () => {
    const tracker = new KnockTracker();
    expect(cue(tracker, ["a"], false, 0)).toBe(null);
    // Host starts presenting; "a" is still waiting.
    expect(cue(tracker, ["a"], true, 1_000)).toBe(null);
    expect(cue(tracker, ["a", "b"], true, 2_000)).toBe("knock");
  });

  test("re-polls never chime again for the same id before the reminder", () => {
    const tracker = new KnockTracker();
    expect(cue(tracker, ["a"], true, 0)).toBe("knock");
    for (let t = 1_000; t < reminder; t += 1_000) {
      expect(cue(tracker, ["a"], true, t)).toBe(null);
    }
  });

  test("a burst is one chime, and a knock inside the gap is owed, not dropped", () => {
    const tracker = new KnockTracker();
    expect(cue(tracker, ["a"], true, 0)).toBe("knock");
    expect(cue(tracker, ["a", "b"], true, gap - 1)).toBe(null);
    // No new id arrives, but the tick after the gap pays the owed chime.
    expect(cue(tracker, ["a", "b"], true, gap)).toBe("knock");
    expect(cue(tracker, ["a", "b"], true, gap + 1_000)).toBe(null);
  });

  test("unseen people still waiting get a reminder every interval", () => {
    const tracker = new KnockTracker();
    expect(cue(tracker, ["a"], true, 0)).toBe("knock");
    expect(cue(tracker, ["a"], true, reminder - 1)).toBe(null);
    expect(cue(tracker, ["a"], true, reminder)).toBe("reminder");
    expect(cue(tracker, ["a"], true, reminder * 2)).toBe("reminder");
  });

  test("no reminder once they are admitted or the host looked back", () => {
    const admitted = new KnockTracker();
    expect(cue(admitted, ["a"], true, 0)).toBe("knock");
    expect(cue(admitted, [], true, reminder)).toBe(null);

    const lookedBack = new KnockTracker();
    expect(cue(lookedBack, ["a"], true, 0)).toBe("knock");
    expect(cue(lookedBack, ["a"], false, 5_000)).toBe(null);
    expect(cue(lookedBack, ["a"], true, reminder * 2)).toBe(null);
  });

  test("an owed chime is dropped when that person is let in meanwhile", () => {
    const tracker = new KnockTracker();
    expect(cue(tracker, ["a"], true, 0)).toBe("knock");
    expect(cue(tracker, ["b"], true, 1_000)).toBe(null);
    expect(cue(tracker, [], true, gap + 1_000)).toBe(null);
  });

  test("knocks while the host is looking at the room never chime later", () => {
    const tracker = new KnockTracker();
    expect(cue(tracker, ["a"], false, 0)).toBe(null);
    expect(cue(tracker, ["a"], true, 20_000)).toBe(null);
    expect(cue(tracker, ["a"], true, reminder * 3)).toBe(null);
  });

  test("every new id flashes the strip, chime or not", () => {
    const tracker = new KnockTracker();
    expect(tracker.update(["a"], false, 0).hasNew).toBe(true);
    expect(tracker.update(["a"], false, 1_000).hasNew).toBe(false);
    expect(tracker.update(["a", "b"], true, 2_000).hasNew).toBe(true);
  });
});

describe("knock sound setting", () => {
  test("defaults on, including when storage throws or is missing", () => {
    const throwing = {
      getItem: () => {
        throw new Error("blocked");
      },
    };
    expect(readKnockSound(undefined)).toBe(true);
    expect(readKnockSound(throwing)).toBe(true);
    expect(readKnockSound({ getItem: () => null })).toBe(true);
  });

  test("round-trips off and on; a throwing write is ignored", () => {
    const map = new Map<string, string>();
    const storage = {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => void map.set(key, value),
    };
    writeKnockSound(storage, false);
    expect(readKnockSound(storage)).toBe(false);
    writeKnockSound(storage, true);
    expect(readKnockSound(storage)).toBe(true);
    expect(() =>
      writeKnockSound(
        {
          setItem: () => {
            throw new Error("quota");
          },
        },
        false,
      ),
    ).not.toThrow();
  });
});
