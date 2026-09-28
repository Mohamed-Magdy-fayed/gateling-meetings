import {
  finishStroke,
  LASER_SAMPLES_MAX,
  type LaserSample,
  POINTS_PER_BATCH,
  type Point,
  thinPoints,
} from "../protocol";
import type { OutgoingAnnotation } from "./use-annotations";

type Output = {
  /** Applies local ink immediately (no network). */
  echo: (message: OutgoingAnnotation) => void;
  /** Sends without echoing again. */
  send: (message: OutgoingAnnotation, options: { echo: false }) => void;
  /** Sends and echoes (`stroke-end` replaces the live stroke). */
  sendAndEcho: (message: OutgoingAnnotation) => void;
};

/**
 * Turns pointer input into ink. Pure (no DOM, no React) so it is unit-tested.
 *
 * Pen: every kept point is echoed locally on the move that produced it, so
 * ink follows the pointer with no flush delay; the same points go out in
 * `points` batches on `flush()` and, on release, as `stroke-end` — so the
 * local, remote and final shapes are the same list.
 *
 * Laser: echoed locally on every move; `flush()` sends the latest position
 * with the samples since the last flush, which receivers replay smoothly.
 */
export class InkRecorder {
  private stroke: { id: string; points: Point[]; flushed: number } | null =
    null;
  private laser: { at: Point; samples: { at: Point; t: number }[] } | null =
    null;

  constructor(
    private readonly shareSid: string,
    private readonly out: Output,
    private readonly newId: () => string = () => crypto.randomUUID(),
  ) {}

  penDown(at: Point) {
    this.stroke = { id: this.newId(), points: [at], flushed: 0 };
    this.out.echo(this.pointsMessage(this.stroke.id, [at]));
  }

  /** `samples` in order: the coalesced positions of one pointer move. */
  penMove(samples: readonly Point[]) {
    const stroke = this.stroke;
    if (!stroke) return;
    const kept = thinPoints(stroke.points.at(-1), samples);
    if (kept.length === 0) return;
    stroke.points.push(...kept);
    this.out.echo(this.pointsMessage(stroke.id, kept));
  }

  penUp() {
    const stroke = this.stroke;
    if (!stroke) return;
    this.flush();
    this.stroke = null;
    this.out.sendAndEcho({
      kind: "stroke-end",
      shareSid: this.shareSid,
      strokeId: stroke.id,
      points: finishStroke(stroke.points),
    });
  }

  /** `samples` in order, each with its event time in ms. */
  laserMove(samples: readonly { at: Point; t: number }[]) {
    const last = samples.at(-1);
    if (!last) return;
    const previous = this.laser?.at;
    if (previous && previous[0] === last.at[0] && previous[1] === last.at[1]) {
      return;
    }
    const pending = [...(this.laser?.samples ?? []), ...samples].slice(
      -LASER_SAMPLES_MAX,
    );
    this.laser = { at: last.at, samples: pending };
    this.out.echo({ kind: "laser", shareSid: this.shareSid, at: last.at });
  }

  flush() {
    const laser = this.laser;
    if (laser && laser.samples.length > 0) {
      const first = laser.samples[0]?.t ?? 0;
      const samples = laser.samples.map(
        ({ at, t }): LaserSample => [
          at[0],
          at[1],
          Math.min(1_000, Math.max(0, Math.round(t - first))),
        ],
      );
      this.laser = { at: laser.at, samples: [] };
      this.out.send(
        { kind: "laser", shareSid: this.shareSid, at: laser.at, samples },
        { echo: false },
      );
    }
    const stroke = this.stroke;
    while (stroke && stroke.flushed < stroke.points.length) {
      const batch = stroke.points.slice(
        stroke.flushed,
        stroke.flushed + POINTS_PER_BATCH,
      );
      stroke.flushed += batch.length;
      this.out.send(this.pointsMessage(stroke.id, batch), { echo: false });
    }
  }

  private pointsMessage(strokeId: string, points: Point[]): OutgoingAnnotation {
    return { kind: "points", shareSid: this.shareSid, strokeId, points };
  }
}
