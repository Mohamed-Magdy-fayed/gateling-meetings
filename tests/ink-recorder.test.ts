import { describe, expect, test } from "vitest";

import { InkRecorder } from "@/features/meetings/components/room/annotations/ink-recorder";
import {
  AnnotationStore,
  laserFrame,
} from "@/features/meetings/components/room/annotations/store";
import type { OutgoingAnnotation } from "@/features/meetings/components/room/annotations/use-annotations";
import {
  type Annotation,
  decodeAnnotation,
  encodeMessage,
  LASER_SAMPLES_MAX,
  normalizeCoordinate,
  POINTS_FLUSH_MS,
  type Point,
  STROKE_MAX_POINTS,
  THIN_MIN_DISTANCE,
  thinPoints,
} from "@/features/meetings/components/room/protocol";

const SHARE = "TR_share";
const ME = "user:me";

function storeWithShare() {
  const store = new AnnotationStore();
  store.setPublishedShares([SHARE]);
  return store;
}

/** A recorder wired to a local store (echo) and a remote one (the network). */
function harness() {
  const local = storeWithShare();
  const remote = storeWithShare();
  const sent: Annotation[] = [];
  const ctx = (isLocal: boolean) => ({
    sender: ME,
    senderName: "Me",
    hostIdentity: ME,
    allowAnnotations: true,
    now: 0,
    isLocal,
  });
  const envelope = (message: OutgoingAnnotation) =>
    ({ v: 1, ...message }) as Annotation;
  const deliver = (message: OutgoingAnnotation) => {
    // Round-trip through the wire format, as the data channel does.
    const decoded = decodeAnnotation(encodeMessage(envelope(message)));
    if (!decoded.ok) throw new Error(`undecodable: ${decoded.reason}`);
    sent.push(decoded.value);
    remote.apply(decoded.value, ctx(false));
  };
  const recorder = new InkRecorder(
    SHARE,
    {
      echo: (message) => local.apply(envelope(message), ctx(true)),
      send: deliver,
      sendAndEcho: (message) => {
        local.apply(envelope(message), ctx(true));
        deliver(message);
      },
    },
    () => "stroke-1",
  );
  return { recorder, local, remote, sent };
}

/** A smooth curve sampled at 240 Hz for `seconds`, `speed` frame-widths/s. */
function curve(seconds: number, speed: number): Point[] {
  const count = Math.round(seconds * 240);
  return Array.from({ length: count }, (_, i) => {
    const s = (i / 240) * speed;
    return [
      normalizeCoordinate(0.1 + (s % 0.8)),
      normalizeCoordinate(0.5 + 0.2 * Math.sin(s * 8)),
    ];
  });
}

describe("thinPoints", () => {
  test("keeps only points at least the minimum distance apart", () => {
    const kept = thinPoints(
      [0, 0],
      [
        [0.001, 0],
        [0.002, 0],
        [0.003, 0],
        [0.01, 0],
      ],
    );
    expect(kept).toEqual([
      [0.002, 0],
      [0.01, 0],
    ]);
  });

  test("keeps the first point when there is no previous one", () => {
    expect(thinPoints(undefined, [[0.5, 0.5]])).toEqual([[0.5, 0.5]]);
  });

  test("3 s of 240 Hz input at normal speed stays under the stroke cap", () => {
    const input = curve(3, 0.15);
    expect(input.length).toBe(720);
    const kept = thinPoints(undefined, input);
    expect(kept.length).toBeLessThan(STROKE_MAX_POINTS);
    for (let i = 1; i < kept.length; i++) {
      const [ax, ay] = kept[i - 1] as Point;
      const [bx, by] = kept[i] as Point;
      expect(Math.hypot(bx - ax, by - ay)).toBeGreaterThanOrEqual(
        THIN_MIN_DISTANCE,
      );
    }
  });
});

describe("pen input (H2: ink follows the pointer, no flush delay)", () => {
  test("each move is on the local store before any flush", () => {
    const { recorder, local, sent } = harness();
    recorder.penDown([0.1, 0.1]);
    recorder.penMove([[0.2, 0.2]]);
    expect(sent).toHaveLength(0);
    expect(local.snapshot(SHARE).strokes[0]?.points).toEqual([
      [0.1, 0.1],
      [0.2, 0.2],
    ]);
  });

  test("local, sent and final points are the same list", () => {
    const { recorder, local, remote, sent } = harness();
    const input = curve(3, 0.15);
    recorder.penDown(input[0] as Point);
    // 240 Hz input delivered as coalesced batches of 4 per move (60 Hz).
    for (let i = 1; i < input.length; i += 4) {
      recorder.penMove(input.slice(i, i + 4));
      if (i % 10 === 1) recorder.flush();
    }
    recorder.flush();
    const live = local.snapshot(SHARE).strokes[0]?.points;
    const remoteLive = remote.snapshot(SHARE).strokes[0]?.points;
    expect(remoteLive).toEqual(live);

    recorder.penUp();
    const end = sent.at(-1);
    expect(end?.kind).toBe("stroke-end");
    expect(end && "points" in end ? end.points : null).toEqual(live);
    // stroke-end does not change the rendered shape on either side.
    expect(local.snapshot(SHARE).strokes[0]?.points).toEqual(live);
    expect(remote.snapshot(SHARE).strokes[0]?.points).toEqual(live);
    expect(local.snapshot(SHARE).strokes[0]?.ended).toBe(true);
  });

  test("nothing is applied twice locally", () => {
    const { recorder, local } = harness();
    recorder.penDown([0.1, 0.1]);
    recorder.penMove([[0.2, 0.2]]);
    recorder.flush();
    recorder.flush();
    expect(local.snapshot(SHARE).strokes[0]?.points).toHaveLength(2);
  });

  test("a stroke over the cap is simplified at the end", () => {
    const { recorder, sent } = harness();
    const zigzag = Array.from(
      { length: 1_000 },
      (_, i) => [i / 1_000, i % 2 ? 0.9 : 0.1] as Point,
    );
    recorder.penDown(zigzag[0] as Point);
    recorder.penMove(zigzag.slice(1));
    recorder.penUp();
    const end = sent.at(-1);
    expect(end && "points" in end ? end.points.length : 0).toBe(
      STROKE_MAX_POINTS,
    );
  });
});

describe("laser samples (H3: smooth remote pointer)", () => {
  test("decodes with and without samples", () => {
    const withSamples = decodeAnnotation(
      encodeMessage({
        v: 1,
        kind: "laser",
        shareSid: SHARE,
        at: [0.3, 0.3],
        samples: [
          [0.1, 0.1, 0],
          [0.3, 0.3, 20],
        ],
      }),
    );
    expect(withSamples.ok).toBe(true);
    const without = decodeAnnotation(
      encodeMessage({ v: 1, kind: "laser", shareSid: SHARE, at: [0.3, 0.3] }),
    );
    expect(without).toMatchObject({ ok: true, value: { at: [0.3, 0.3] } });
    const tooMany = decodeAnnotation(
      encodeMessage({
        v: 1,
        kind: "laser",
        shareSid: SHARE,
        at: [0.3, 0.3],
        samples: Array.from({ length: LASER_SAMPLES_MAX + 1 }, (_, i) => [
          0.1,
          0.1,
          i,
        ]),
      }),
    );
    expect(tooMany).toMatchObject({ ok: false, reason: "schema" });
  });

  test("the recorder echoes each move and sends the samples on flush", () => {
    const { recorder, local, sent } = harness();
    recorder.laserMove([{ at: [0.1, 0.1], t: 1_000 }]);
    recorder.laserMove([
      { at: [0.2, 0.2], t: 1_010 },
      { at: [0.3, 0.3], t: 1_020 },
    ]);
    expect(local.snapshot(SHARE).lasers[0]?.trail.at(-1)?.at).toEqual([
      0.3, 0.3,
    ]);
    expect(sent).toHaveLength(0);
    recorder.flush();
    expect(sent).toEqual([
      {
        v: 1,
        kind: "laser",
        shareSid: SHARE,
        at: [0.3, 0.3],
        samples: [
          [0.1, 0.1, 0],
          [0.2, 0.2, 10],
          [0.3, 0.3, 20],
        ],
      },
    ]);
    // An unchanged pointer sends nothing more.
    recorder.flush();
    expect(sent).toHaveLength(1);
  });

  test("the store schedules samples on the receiver's clock", () => {
    const store = storeWithShare();
    store.apply(
      {
        v: 1,
        kind: "laser",
        shareSid: SHARE,
        at: [0.3, 0.3],
        samples: [
          [0.1, 0.1, 0],
          [0.3, 0.3, 20],
        ],
      },
      {
        sender: "guest:1",
        senderName: "G",
        hostIdentity: null,
        allowAnnotations: true,
        now: 5_000,
      },
    );
    const trail = store.snapshot(SHARE).lasers[0]?.trail ?? [];
    expect(trail.map((entry) => entry.t)).toEqual([5_000, 5_020]);
  });

  test("a batch never starts behind the previous one, nor lags a flush", () => {
    const store = storeWithShare();
    const ctx = (now: number) => ({
      sender: "guest:1",
      senderName: "G",
      hostIdentity: null,
      allowAnnotations: true,
      now,
    });
    const batch = {
      v: 1 as const,
      kind: "laser" as const,
      shareSid: SHARE,
      at: [0.3, 0.3] as Point,
      samples: [
        [0.1, 0.1, 0],
        [0.3, 0.3, 30],
      ] as [number, number, number][],
    };
    store.apply(batch, ctx(0));
    store.apply(batch, ctx(10));
    const trail = store.snapshot(SHARE).lasers[0]?.trail ?? [];
    // Second batch starts where the first ends (30), not at 10.
    expect(trail.map((entry) => entry.t)).toEqual([0, 30, 30, 60]);
    // Far behind: clamped to one flush ahead of now.
    store.apply(batch, ctx(11));
    const last = store.snapshot(SHARE).lasers[0]?.trail.at(-2);
    expect(last?.t).toBe(11 + POINTS_FLUSH_MS);
  });

  test("an older client's single point is shown immediately", () => {
    const store = storeWithShare();
    store.apply(
      { v: 1, kind: "laser", shareSid: SHARE, at: [0.4, 0.4] },
      {
        sender: "guest:1",
        senderName: "G",
        hostIdentity: null,
        allowAnnotations: true,
        now: 100,
      },
    );
    expect(store.snapshot(SHARE).lasers[0]?.trail).toEqual([
      { at: [0.4, 0.4], t: 100 },
    ]);
  });
});

describe("laserFrame", () => {
  const trail = [
    { at: [0, 0] as Point, t: 0 },
    { at: [1, 1] as Point, t: 100 },
  ];

  test("nothing before the first entry is due", () => {
    expect(laserFrame(trail, -1)).toBeNull();
  });

  test("the head interpolates toward the next scheduled entry", () => {
    expect(laserFrame(trail, 25)?.head).toEqual([0.25, 0.25]);
    expect(laserFrame(trail, 25)?.due).toHaveLength(1);
  });

  test("after the last entry the head rests on it", () => {
    expect(laserFrame(trail, 500)).toMatchObject({
      head: [1, 1],
      headT: 100,
    });
  });
});
