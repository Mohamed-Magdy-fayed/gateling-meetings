import { describe, expect, test } from "vitest";

import { isFlagOn, isOptInFlag } from "@/features/meetings/lib/flags";
import {
  isPipAnnotateAvailable,
  resolveMeetingFeatures,
} from "@/features/meetings/lib/meeting-flags";

describe("isFlagOn (kill switches: on unless turned off)", () => {
  test("unset and empty are on", () => {
    expect(isFlagOn(undefined)).toBe(true);
    expect(isFlagOn("")).toBe(true);
  });

  test("0 / false / off / no turn it off, any case and spacing", () => {
    for (const value of ["0", "false", " OFF ", "No"]) {
      expect(isFlagOn(value)).toBe(false);
    }
  });
});

describe("isOptInFlag (experiments: off unless turned on)", () => {
  test("unset and empty are off", () => {
    expect(isOptInFlag(undefined)).toBe(false);
    expect(isOptInFlag("")).toBe(false);
  });

  test("1 / true / on / yes turn it on, any case and spacing", () => {
    for (const value of ["on", " ON ", "1", "true", "Yes"]) {
      expect(isOptInFlag(value)).toBe(true);
    }
  });

  test("anything else stays off", () => {
    for (const value of ["0", "off", "enabled", "maybe"]) {
      expect(isOptInFlag(value)).toBe(false);
    }
  });
});

describe("resolveMeetingFeatures (admin switches over env defaults)", () => {
  const defaults = {
    annotations: true,
    pipHostControls: true,
    pipAnnotate: false,
  };

  test("nothing stored: the defaults", () => {
    expect(resolveMeetingFeatures(undefined, defaults)).toEqual(defaults);
    expect(resolveMeetingFeatures(null, defaults)).toEqual(defaults);
  });

  test("stored switches win, key by key", () => {
    expect(resolveMeetingFeatures({ pipAnnotate: true }, defaults)).toEqual({
      ...defaults,
      pipAnnotate: true,
    });
    expect(
      resolveMeetingFeatures(
        { annotations: false, pipHostControls: false, pipAnnotate: true },
        defaults,
      ),
    ).toEqual({
      annotations: false,
      pipHostControls: false,
      pipAnnotate: true,
    });
  });

  test("a malformed row never breaks the room", () => {
    expect(resolveMeetingFeatures("junk", defaults)).toEqual(defaults);
    expect(resolveMeetingFeatures({ pipAnnotate: "yes" }, defaults)).toEqual(
      defaults,
    );
  });

  test("floating-window annotate needs annotations on too", () => {
    expect(
      isPipAnnotateAvailable({
        ...defaults,
        annotations: false,
        pipAnnotate: true,
      }),
    ).toBe(false);
    expect(isPipAnnotateAvailable({ ...defaults, pipAnnotate: true })).toBe(
      true,
    );
  });
});
