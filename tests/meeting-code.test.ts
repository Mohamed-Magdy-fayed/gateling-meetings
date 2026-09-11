import { describe, expect, it } from "vitest";

import {
  generateMeetingCode,
  MEETING_CODE_PATTERN,
  normalizeMeetingCode,
} from "@/features/meetings/lib/meeting-code";

describe("generateMeetingCode", () => {
  it("produces the xxx-xxxx-xxx shape from the crypto source", () => {
    for (let i = 0; i < 50; i++) {
      expect(generateMeetingCode()).toMatch(MEETING_CODE_PATTERN);
    }
  });

  it("is deterministic given an injected random source", () => {
    const zero = () => 0;
    expect(generateMeetingCode(zero)).toBe("bbb-bbbb-bbb");
  });

  it("never contains a vowel, so a code cannot spell a word", () => {
    for (let i = 0; i < 200; i++) {
      expect(generateMeetingCode()).not.toMatch(/[aeiou]/);
    }
  });
});

describe("normalizeMeetingCode", () => {
  it("returns a canonical code unchanged", () => {
    expect(normalizeMeetingCode("abc-defg-hij")).toBe("abc-defg-hij");
  });

  it("accepts a code typed without dashes or with spaces / uppercase", () => {
    expect(normalizeMeetingCode("abcdefghij")).toBe("abc-defg-hij");
    expect(normalizeMeetingCode("  ABC DEFG HIJ ")).toBe("abc-defg-hij");
  });

  it("extracts the code from a pasted meeting URL", () => {
    expect(
      normalizeMeetingCode("https://meet.gateling.com/m/abc-defg-hij?x=1"),
    ).toBe("abc-defg-hij");
    expect(normalizeMeetingCode("/m/abc-defg-hij/")).toBe("abc-defg-hij");
  });

  it("rejects anything that is not ten letters", () => {
    expect(normalizeMeetingCode("")).toBeNull();
    expect(normalizeMeetingCode("abc-defg")).toBeNull();
    expect(normalizeMeetingCode("123-4567-890")).toBeNull();
    expect(normalizeMeetingCode("https://example.com/")).toBeNull();
  });
});
