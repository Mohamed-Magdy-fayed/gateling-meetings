import { describe, expect, test } from "vitest";

import { isFlagOn, isOptInFlag } from "@/features/meetings/lib/flags";

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
