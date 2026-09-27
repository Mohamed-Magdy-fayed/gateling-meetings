import { describe, expect, test } from "vitest";

import {
  annotationsAllowed,
  breakoutMetadata,
  mergeRoomMetadata,
  parseRoomMetadata,
} from "@/integrations/livekit/room-metadata";

describe("parseRoomMetadata", () => {
  test("reads the known keys and drops wrongly typed ones", () => {
    expect(
      parseRoomMetadata(
        JSON.stringify({ allowAnnotations: "no", breakout: "R1", main: 5 }),
      ),
    ).toEqual({ breakout: "R1" });
  });

  test("never throws on junk", () => {
    expect(parseRoomMetadata("{not json")).toEqual({});
    expect(parseRoomMetadata("[1,2]")).toEqual({});
    expect(parseRoomMetadata(undefined)).toEqual({});
  });
});

describe("mergeRoomMetadata", () => {
  test("keeps breakout keys and unknown keys", () => {
    const merged = mergeRoomMetadata(
      JSON.stringify({ breakout: "R1", main: "abc", future: true }),
      { allowAnnotations: false },
    );
    expect(JSON.parse(merged)).toEqual({
      breakout: "R1",
      main: "abc",
      future: true,
      allowAnnotations: false,
    });
  });

  test("replaces unparseable metadata", () => {
    expect(
      JSON.parse(mergeRoomMetadata("{oops", { allowAnnotations: true })),
    ).toEqual({ allowAnnotations: true });
  });
});

test("breakoutMetadata round-trips through the parser", () => {
  expect(parseRoomMetadata(breakoutMetadata("Room 1", "abc", false))).toEqual({
    breakout: "Room 1",
    main: "abc",
    allowAnnotations: false,
  });
});

test("a missing allowAnnotations key means allowed", () => {
  expect(annotationsAllowed({})).toBe(true);
  expect(annotationsAllowed({ allowAnnotations: false })).toBe(false);
});
