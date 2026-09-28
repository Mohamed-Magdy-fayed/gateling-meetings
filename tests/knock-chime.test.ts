import { describe, expect, test } from "vitest";

import {
  KnockTracker,
  readKnockSound,
  writeKnockSound,
} from "@/features/meetings/components/room/knock-chime";
import { PIP_TIMINGS } from "@/features/meetings/components/room/pip-timings";

describe("KnockTracker", () => {
  test("people already waiting when the host looked away do not chime", () => {
    const tracker = new KnockTracker();
    expect(tracker.update(["a"], false, 0)).toBe(false);
    // Host starts presenting; "a" is still waiting.
    expect(tracker.update(["a"], true, 1_000)).toBe(false);
    expect(tracker.update(["a", "b"], true, 2_000)).toBe(true);
  });

  test("re-polls never chime again for the same id", () => {
    const tracker = new KnockTracker();
    expect(tracker.update(["a"], true, 0)).toBe(true);
    for (let t = 3_000; t < 60_000; t += 3_000) {
      expect(tracker.update(["a"], true, t)).toBe(false);
    }
  });

  test("at most one chime per interval, however many knock", () => {
    const tracker = new KnockTracker();
    const gap = PIP_TIMINGS.CHIME_MIN_INTERVAL_MS;
    expect(tracker.update(["a"], true, 0)).toBe(true);
    expect(tracker.update(["a", "b"], true, gap - 1)).toBe(false);
    expect(tracker.update(["a", "b", "c"], true, gap + 1)).toBe(true);
  });

  test("knocks while the host is looking at the room never chime later", () => {
    const tracker = new KnockTracker();
    expect(tracker.update(["a"], false, 0)).toBe(false);
    expect(tracker.update(["a"], true, 20_000)).toBe(false);
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
