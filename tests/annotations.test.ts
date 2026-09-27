import { describe, expect, test } from "vitest";

import {
  contentBox,
  INK_COLOURS,
  inkSlot,
} from "@/features/meetings/components/room/annotations/geometry";
import {
  AnnotationStore,
  type ApplyContext,
} from "@/features/meetings/components/room/annotations/store";
import {
  type Annotation,
  BUCKET_BURST,
  BUCKET_REFILL_PER_SECOND,
  createRateLimiter,
  decodeAnnotation,
  decodeHostRequest,
  encodeMessage,
  finishStroke,
  isFromHost,
  MESSAGE_MAX_BYTES,
  normalizeCoordinate,
  POINTS_PER_BATCH,
  type Point,
  STROKE_MAX_POINTS,
  STROKES_PER_SENDER,
  simplify,
} from "@/features/meetings/components/room/protocol";

const SHARE = "TR_share";
const HOST = "user:host";

function ctx(sender: string, overrides: Partial<ApplyContext> = {}) {
  return {
    sender,
    senderName: sender,
    hostIdentity: HOST,
    allowAnnotations: true,
    now: 0,
    ...overrides,
  } satisfies ApplyContext;
}

function storeWithShare() {
  const store = new AnnotationStore();
  store.setPublishedShares([SHARE]);
  return store;
}

const end = (strokeId: string, points: Point[] = [[0.1, 0.1]]): Annotation => ({
  v: 1,
  kind: "stroke-end",
  shareSid: SHARE,
  strokeId,
  points,
});

describe("protocol decoding", () => {
  test("accepts a valid message and clamps coordinates", () => {
    const decoded = decodeAnnotation(
      encodeMessage({ v: 1, kind: "laser", shareSid: SHARE, at: [1.5, -2] }),
    );
    expect(decoded).toEqual({
      ok: true,
      value: { v: 1, kind: "laser", shareSid: SHARE, at: [1, 0] },
    });
  });

  test("rounds to 4 decimals and turns NaN into 0", () => {
    expect(normalizeCoordinate(0.123456)).toBe(0.1235);
    expect(normalizeCoordinate(Number.NaN)).toBe(0);
  });

  test("drops other versions, junk and unknown kinds", () => {
    expect(
      decodeAnnotation(encodeMessage({ v: 2, kind: "clear", shareSid: SHARE })),
    ).toMatchObject({ ok: false, reason: "version" });
    expect(decodeAnnotation(new TextEncoder().encode("{nope"))).toMatchObject({
      ok: false,
      reason: "json",
    });
    expect(
      decodeAnnotation(encodeMessage({ v: 1, kind: "boom", shareSid: SHARE })),
    ).toMatchObject({ ok: false, reason: "schema" });
  });

  test("rejects batches over the point cap", () => {
    const points = Array.from(
      { length: POINTS_PER_BATCH + 1 },
      () => [0.5, 0.5] as Point,
    );
    expect(
      decodeAnnotation(
        encodeMessage({
          v: 1,
          kind: "points",
          shareSid: SHARE,
          strokeId: "s",
          points,
        }),
      ),
    ).toMatchObject({ ok: false, reason: "schema" });
  });

  test("rejects payloads over the byte cap before parsing", () => {
    expect(
      decodeAnnotation(new Uint8Array(MESSAGE_MAX_BYTES + 1)),
    ).toMatchObject({ ok: false, reason: "size" });
  });

  test("host requests decode", () => {
    expect(
      decodeHostRequest(encodeMessage({ v: 1, kind: "ask-unmute" })),
    ).toEqual({ ok: true, value: { v: 1, kind: "ask-unmute" } });
    expect(
      decodeHostRequest(encodeMessage({ v: 1, kind: "force-unmute" })),
    ).toMatchObject({ ok: false });
  });
});

describe("isFromHost", () => {
  test("only the server-reported host identity counts", () => {
    expect(isFromHost(HOST, HOST)).toBe(true);
    expect(isFromHost("guest:1", HOST)).toBe(false);
    expect(isFromHost(undefined, HOST)).toBe(false);
    expect(isFromHost(HOST, null)).toBe(false);
  });
});

describe("stroke simplification", () => {
  test("handles 0, 1 and 2 points", () => {
    expect(simplify([])).toEqual([]);
    expect(simplify([[0, 0]])).toEqual([[0, 0]]);
    expect(
      simplify([
        [0, 0],
        [1, 1],
      ]),
    ).toEqual([
      [0, 0],
      [1, 1],
    ]);
  });

  test("drops collinear points and keeps corners", () => {
    expect(
      simplify([
        [0, 0],
        [0.25, 0],
        [0.5, 0],
        [0.5, 0.5],
      ]),
    ).toEqual([
      [0, 0],
      [0.5, 0],
      [0.5, 0.5],
    ]);
  });

  test("caps a long stroke at the maximum, keeping both ends", () => {
    const zigzag = Array.from(
      { length: 2_000 },
      (_, i) => [i / 2_000, i % 2 ? 0.9 : 0.1] as Point,
    );
    const finished = finishStroke(zigzag);
    expect(finished).toHaveLength(STROKE_MAX_POINTS);
    expect(finished[0]).toEqual(zigzag[0]);
    expect(finished.at(-1)).toEqual(zigzag.at(-1));
  });
});

describe("rate limiter", () => {
  test("drops a burst beyond the bucket, then refills", () => {
    const limiter = createRateLimiter();
    let accepted = 0;
    for (let i = 0; i < BUCKET_BURST + 10; i++) {
      if (limiter.take("guest:1", 0)) accepted++;
    }
    expect(accepted).toBe(BUCKET_BURST);
    expect(limiter.take("guest:1", 0)).toBe(false);
    expect(limiter.take("guest:1", 1_000 / BUCKET_REFILL_PER_SECOND)).toBe(
      true,
    );
    // Other senders have their own bucket.
    expect(limiter.take("guest:2", 0)).toBe(true);
  });

  test("reliable kinds are never rate limited by the store", () => {
    const store = storeWithShare();
    for (let i = 0; i < BUCKET_BURST; i++) {
      store.apply(
        { v: 1, kind: "laser", shareSid: SHARE, at: [0.5, 0.5] },
        ctx("guest:1"),
      );
    }
    expect(
      store.apply(
        { v: 1, kind: "laser", shareSid: SHARE, at: [0.5, 0.5] },
        ctx("guest:1"),
      ),
    ).toBe("rate-limit");
    expect(store.apply(end("s1"), ctx("guest:1"))).toBeNull();
  });
});

describe("annotation store", () => {
  test("drops messages for shares that are not published", () => {
    const store = new AnnotationStore();
    expect(store.apply(end("s1"), ctx("guest:1"))).toBe("share");
  });

  test("keys strokes by owner, so a foreign id never reaches another's stroke", () => {
    const store = storeWithShare();
    store.apply(end("s1"), ctx("guest:1"));
    // guest:2 reuses guest:1's stroke id: it gets its own stroke.
    store.apply(
      {
        v: 1,
        kind: "points",
        shareSid: SHARE,
        strokeId: "s1",
        points: [[0.9, 0.9]],
      },
      ctx("guest:2"),
    );
    const strokes = store.snapshot(SHARE).strokes;
    expect(strokes.map((stroke) => stroke.key).sort()).toEqual([
      "guest:1:s1",
      "guest:2:s1",
    ]);
    expect(strokes.find((s) => s.owner === "guest:1")?.points).toEqual([
      [0.1, 0.1],
    ]);
  });

  test("undo removes only the sender's own stroke; unknown ids are ignored", () => {
    const store = storeWithShare();
    store.apply(end("s1"), ctx("guest:1"));
    store.apply(end("s2"), ctx("guest:1"));
    expect(
      store.apply(
        { v: 1, kind: "undo", shareSid: SHARE, strokeId: "s2" },
        ctx("guest:2"),
      ),
    ).toBe("unknown-stroke");
    expect(store.snapshot(SHARE).strokes).toHaveLength(2);
    store.apply(
      { v: 1, kind: "undo", shareSid: SHARE, strokeId: "s2" },
      ctx("guest:1"),
    );
    expect(store.snapshot(SHARE).strokes.map((s) => s.id)).toEqual(["s1"]);
    expect(store.lastStrokeOf(SHARE, "guest:1")).toBe("s1");
  });

  test("clear removes only the sender's ink; clear-all only from the host", () => {
    const store = storeWithShare();
    store.apply(end("a"), ctx("guest:1"));
    store.apply(end("b"), ctx("guest:2"));
    store.apply({ v: 1, kind: "clear", shareSid: SHARE }, ctx("guest:2"));
    expect(store.snapshot(SHARE).strokes.map((s) => s.owner)).toEqual([
      "guest:1",
    ]);
    expect(
      store.apply({ v: 1, kind: "clear-all", shareSid: SHARE }, ctx("guest:2")),
    ).toBe("not-host");
    expect(store.snapshot(SHARE).strokes).toHaveLength(1);
    store.apply({ v: 1, kind: "clear-all", shareSid: SHARE }, ctx(HOST));
    expect(store.snapshot(SHARE).strokes).toHaveLength(0);
  });

  test("ignores points that arrive after stroke-end or undo", () => {
    const store = storeWithShare();
    const late: Annotation = {
      v: 1,
      kind: "points",
      shareSid: SHARE,
      strokeId: "s1",
      points: [[0.7, 0.7]],
    };
    store.apply(
      end("s1", [
        [0.1, 0.1],
        [0.2, 0.2],
      ]),
      ctx("guest:1"),
    );
    expect(store.apply(late, ctx("guest:1"))).toBe("ordering");
    expect(store.snapshot(SHARE).strokes[0]?.points).toHaveLength(2);

    store.apply(
      { v: 1, kind: "undo", shareSid: SHARE, strokeId: "s9" },
      ctx("guest:1"),
    );
    expect(
      store.apply({ ...late, strokeId: "s9" } as Annotation, ctx("guest:1")),
    ).toBe("ordering");
  });

  test("stroke-end replaces the partial points", () => {
    const store = storeWithShare();
    store.apply(
      {
        v: 1,
        kind: "points",
        shareSid: SHARE,
        strokeId: "s1",
        points: [[0.3, 0.3]],
      },
      ctx("guest:1"),
    );
    store.apply(
      end("s1", [
        [0.1, 0.1],
        [0.2, 0.2],
      ]),
      ctx("guest:1"),
    );
    expect(store.snapshot(SHARE).strokes[0]).toMatchObject({
      ended: true,
      points: [
        [0.1, 0.1],
        [0.2, 0.2],
      ],
    });
  });

  test("keeps at most the per-sender cap, evicting the oldest", () => {
    const store = storeWithShare();
    for (let i = 0; i <= STROKES_PER_SENDER; i++) {
      store.apply(end(`s${i}`), ctx("guest:1"));
    }
    const ids = store.snapshot(SHARE).strokes.map((s) => s.id);
    expect(ids).toHaveLength(STROKES_PER_SENDER);
    expect(ids).not.toContain("s0");
  });

  test("drops non-host ink while annotations are off; the host still draws", () => {
    const store = storeWithShare();
    expect(
      store.apply(end("s1"), ctx("guest:1", { allowAnnotations: false })),
    ).toBe("setting-off");
    expect(
      store.apply(end("h1"), ctx(HOST, { allowAnnotations: false })),
    ).toBeNull();
  });

  test("turning annotations off removes non-host ink only", () => {
    const store = storeWithShare();
    store.apply(end("s1"), ctx("guest:1"));
    store.apply(end("h1"), ctx(HOST));
    store.removeNonHost(HOST);
    expect(store.snapshot(SHARE).strokes.map((s) => s.owner)).toEqual([HOST]);
  });

  test("purges a share's ink when it unpublishes", () => {
    const store = storeWithShare();
    store.apply(end("s1"), ctx("guest:1"));
    store.setPublishedShares([]);
    store.setPublishedShares([SHARE]);
    expect(store.snapshot(SHARE).strokes).toHaveLength(0);
  });

  test("a pause clears the share and flags it", () => {
    const store = storeWithShare();
    store.apply(end("s1"), ctx("guest:1"));
    store.clearForPause(SHARE);
    const snapshot = store.snapshot(SHARE);
    expect(snapshot.strokes).toHaveLength(0);
    expect(snapshot.clearedByPause).toBe(true);
    expect(store.lastStrokeOf(SHARE, "guest:1")).toBeNull();
  });

  test("counts other annotators for the sharer", () => {
    const store = storeWithShare();
    store.apply(end("s1"), ctx("guest:1"));
    store.apply(end("h1"), ctx(HOST));
    expect(store.annotators(SHARE, HOST)).toBe(1);
  });

  test("snapshots keep their identity until something changes", () => {
    const store = storeWithShare();
    store.apply(end("s1"), ctx("guest:1"));
    const first = store.snapshot(SHARE);
    expect(store.snapshot(SHARE)).toBe(first);
    store.apply(end("s2"), ctx("guest:1"));
    expect(store.snapshot(SHARE)).not.toBe(first);
  });
});

describe("content box (object-contain letterboxing)", () => {
  test("pillarboxes a 4:3 frame in a 16:9 element", () => {
    expect(contentBox(1600, 900, 1024, 768)).toEqual({
      left: 200,
      top: 0,
      width: 1200,
      height: 900,
    });
  });

  test("letterboxes a wide frame in a tall element", () => {
    expect(contentBox(400, 800, 1920, 1080)).toEqual({
      left: 0,
      top: 287.5,
      width: 400,
      height: 225,
    });
  });

  test("renders nothing for zero sizes", () => {
    expect(contentBox(0, 800, 1920, 1080)).toBeNull();
    expect(contentBox(400, 800, 0, 0)).toBeNull();
  });
});

describe("ink palette", () => {
  test("assigns a stable slot per identity", () => {
    expect(inkSlot("guest:abc")).toBe(inkSlot("guest:abc"));
    const slots = new Set(
      Array.from({ length: 64 }, (_, i) => inkSlot(`guest:${i}`)),
    );
    for (const slot of slots) {
      expect(slot).toBeGreaterThanOrEqual(0);
      expect(slot).toBeLessThan(INK_COLOURS);
    }
    expect(slots.size).toBeGreaterThan(4);
  });
});
