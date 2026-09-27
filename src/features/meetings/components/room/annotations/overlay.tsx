"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";

import { useTranslation } from "@/features/core/i18n/client";
import { cn } from "@/lib/utils";
import {
  finishStroke,
  LASER_FADE_MS,
  normalizeCoordinate,
  POINTS_FLUSH_MS,
  POINTS_PER_BATCH,
  type Point,
} from "../protocol";
import { type Box, contentBox, inkColour } from "./geometry";
import type { Laser, Stroke } from "./store";
import { AnnotationToolbar, type Tool } from "./toolbar";
import { useAnnotations, useAnnotationVersion } from "./use-annotations";

type AnnotationLayerProps = {
  /** The share tile's `<video>`; null while the share is paused. */
  video: HTMLVideoElement | null;
  shareSid: string;
  /** The local user's own share (the sharer's Annotate view). */
  isOwnShare: boolean;
};

/** The frame's box inside the video element, kept current on resize. */
function useContentBox(video: HTMLVideoElement | null): Box | null {
  const [box, setBox] = useState<Box | null>(null);
  useEffect(() => {
    if (!video) {
      setBox(null);
      return;
    }
    const measure = () =>
      setBox(
        contentBox(
          video.clientWidth,
          video.clientHeight,
          video.videoWidth,
          video.videoHeight,
        ),
      );
    measure();
    // Captured windows change size mid-share: `resize` fires on the video.
    video.addEventListener("resize", measure);
    video.addEventListener("loadedmetadata", measure);
    const observer = new ResizeObserver(measure);
    observer.observe(video);
    return () => {
      video.removeEventListener("resize", measure);
      video.removeEventListener("loadedmetadata", measure);
      observer.disconnect();
    };
  }, [video]);
  return box;
}

function isEditable(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    target.closest("input, textarea, select, [contenteditable=true]") != null
  );
}

/**
 * Ink over a screen share: everyone's strokes and laser pointers, plus the
 * local user's tools. The ink layer is `dir="ltr"` and positioned with
 * physical left/top inside the frame — frame coordinates are not text
 * direction — while the toolbar is chrome and uses logical properties.
 */
export function AnnotationLayer({
  video,
  shareSid,
  isOwnShare,
}: AnnotationLayerProps) {
  const { t } = useTranslation();
  const annotations = useAnnotations();
  useAnnotationVersion(annotations?.store);
  const box = useContentBox(video);
  const [tool, setTool] = useState<Tool>("none");
  const canDraw = annotations?.canDraw ?? false;
  const activeTool: Tool = canDraw && video ? tool : "none";

  // No tools while paused or when the host turns annotations off.
  useEffect(() => {
    if (!canDraw || !video) setTool("none");
  }, [canDraw, video]);

  // Keep the sharer's own preview from decoding frames nobody is looking at.
  useEffect(() => {
    if (!isOwnShare || !video) return;
    const sync = () => {
      if (document.visibilityState === "hidden") video.pause();
      else void video.play().catch(() => {});
    };
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, [isOwnShare, video]);

  const store = annotations?.store;
  const localIdentity = annotations?.localIdentity ?? "";
  const send = annotations?.send;
  const snapshot = store?.snapshot(shareSid);
  const lastOwnStroke = store?.lastStrokeOf(shareSid, localIdentity) ?? null;

  const undo = useCallback(() => {
    if (!store || !send) return;
    const strokeId = store.lastStrokeOf(shareSid, localIdentity);
    if (strokeId) send({ kind: "undo", shareSid, strokeId });
  }, [store, send, shareSid, localIdentity]);

  // Esc leaves the tool; Ctrl/Cmd+Z undoes — never while typing.
  useEffect(() => {
    if (activeTool === "none") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditable(event.target)) return;
      if (event.key === "Escape") setTool("none");
      if (
        (event.ctrlKey || event.metaKey) &&
        !event.shiftKey &&
        event.key.toLowerCase() === "z"
      ) {
        event.preventDefault();
        undo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeTool, undo]);

  if (!annotations || !snapshot) return null;

  if (!video) {
    return snapshot.clearedByPause ? (
      <p className="pointer-events-none absolute inset-x-0 bottom-14 z-10 text-center text-xs text-neutral-300">
        {t("meetings.annotate.cleared")}
      </p>
    ) : null;
  }

  return (
    <div
      className="absolute inset-0"
      data-annotating={activeTool !== "none" ? "true" : undefined}
    >
      {box && (
        <div
          dir="ltr"
          className={cn(
            "absolute touch-none",
            activeTool === "none" && "pointer-events-none",
            activeTool === "pen" && "cursor-crosshair",
            activeTool === "laser" && "cursor-none",
          )}
          style={{
            left: box.left,
            top: box.top,
            width: box.width,
            height: box.height,
          }}
        >
          <Ink strokes={snapshot.strokes} />
          <Lasers lasers={snapshot.lasers} store={store} />
          {activeTool !== "none" && send && (
            <PointerInput tool={activeTool} shareSid={shareSid} send={send} />
          )}
        </div>
      )}
      {activeTool !== "none" && (
        <div className="pointer-events-none absolute inset-0 rounded-xl ring-2 ring-primary ring-inset" />
      )}
      {canDraw ? (
        <AnnotationToolbar
          tool={activeTool}
          onToolChange={setTool}
          canUndo={lastOwnStroke != null}
          onUndo={undo}
          onClearMine={() => send?.({ kind: "clear", shareSid })}
          onClearAll={
            annotations.isHost
              ? () => send?.({ kind: "clear-all", shareSid })
              : undefined
          }
        />
      ) : (
        isOwnShare && (
          <span className="absolute top-2 start-2 z-20 rounded-md bg-black/50 px-2 py-1 text-xs text-white">
            {t("meetings.annotate.viewOnly")}
          </span>
        )
      )}
    </div>
  );
}

/** Every stroke, ended ones memoised; a dark halo keeps ink readable on any content. */
const Ink = memo(function Ink({ strokes }: { strokes: readonly Stroke[] }) {
  return (
    <svg
      data-annotation-ink
      className="pointer-events-none absolute inset-0 size-full overflow-visible"
      viewBox="0 0 1 1"
      preserveAspectRatio="none"
      aria-hidden
    >
      {strokes.map((stroke) => (
        <StrokePath key={stroke.key} stroke={stroke} />
      ))}
    </svg>
  );
});

const StrokePath = memo(function StrokePath({ stroke }: { stroke: Stroke }) {
  const points = stroke.points.map(([x, y]) => `${x},${y}`).join(" ");
  const single = stroke.points.length === 1;
  const [x, y] = stroke.points[0] ?? [0, 0];
  const common = {
    fill: "none",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    vectorEffect: "non-scaling-stroke" as const,
  };
  // A single tap still draws a dot.
  const shape = single
    ? { d: `M${x},${y}L${x},${y}` }
    : { d: `M${points.replaceAll(" ", "L")}` };
  return (
    <g>
      <path
        {...common}
        {...shape}
        stroke="black"
        strokeOpacity={0.6}
        strokeWidth={7}
      />
      <path
        {...common}
        {...shape}
        stroke={inkColour(stroke.owner)}
        strokeWidth={3}
      />
    </g>
  );
});

/** Laser dots with a short fading trail and the sender's name. */
function Lasers({
  lasers,
  store,
}: {
  lasers: readonly Laser[];
  store: { expireLasers: (now: number) => boolean } | undefined;
}) {
  const [now, setNow] = useState(() => performance.now());
  const hasLasers = lasers.length > 0;
  // Animate the fade only while a pointer is visible.
  useEffect(() => {
    if (!hasLasers || !store) return;
    let frame = requestAnimationFrame(function tick(time) {
      setNow(time);
      if (store.expireLasers(time)) frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [hasLasers, store]);

  return (
    <div className="pointer-events-none absolute inset-0">
      {lasers.map((laser) => {
        const colour = inkColour(laser.owner);
        const last = laser.trail.at(-1);
        if (!last) return null;
        const [x, y] = last.at;
        const flip = x > 0.75;
        return (
          <div key={laser.owner}>
            {laser.trail.map((entry, index) => {
              const age = Math.max(0, now - entry.t);
              const opacity = Math.max(0, 1 - age / LASER_FADE_MS);
              const isHead = index === laser.trail.length - 1;
              return (
                <span
                  key={entry.t}
                  className={cn(
                    "absolute -translate-x-1/2 -translate-y-1/2 rounded-full shadow-[0_0_0_2px_rgb(0_0_0/0.6)]",
                    isHead ? "size-3.5" : "size-2",
                  )}
                  style={{
                    left: `${entry.at[0] * 100}%`,
                    top: `${entry.at[1] * 100}%`,
                    background: colour,
                    opacity: isHead ? opacity : opacity * 0.5,
                  }}
                />
              );
            })}
            <span
              className={cn(
                "absolute -translate-y-1/2 whitespace-nowrap rounded-full border-2 bg-black/75 px-2 py-0.5 text-[0.6875rem] font-medium text-white shadow",
                flip ? "-translate-x-[calc(100%+0.75rem)]" : "translate-x-3",
              )}
              style={{
                left: `${x * 100}%`,
                top: `${y * 100}%`,
                borderColor: colour,
                opacity: Math.max(0, 1 - (now - last.t) / LASER_FADE_MS),
              }}
            >
              <bdi>{laser.name}</bdi>
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Turns pointer input into protocol messages: laser moves every
 * `POINTS_FLUSH_MS` when changed; pen points batched on the same clock,
 * then the whole simplified stroke as `stroke-end` on release.
 */
function PointerInput({
  tool,
  shareSid,
  send,
}: {
  tool: Exclude<Tool, "none">;
  shareSid: string;
  send: NonNullable<ReturnType<typeof useAnnotations>>["send"];
}) {
  const laserRef = useRef<{ at: Point; sent: boolean } | null>(null);
  const strokeRef = useRef<{
    id: string;
    points: Point[];
    flushed: number;
  } | null>(null);

  const flush = useCallback(() => {
    const laser = laserRef.current;
    if (laser && !laser.sent) {
      laser.sent = true;
      send({ kind: "laser", shareSid, at: laser.at });
    }
    const stroke = strokeRef.current;
    if (stroke && stroke.flushed < stroke.points.length) {
      while (stroke.flushed < stroke.points.length) {
        const batch = stroke.points.slice(
          stroke.flushed,
          stroke.flushed + POINTS_PER_BATCH,
        );
        stroke.flushed += batch.length;
        send({ kind: "points", shareSid, strokeId: stroke.id, points: batch });
      }
    }
  }, [send, shareSid]);

  useEffect(() => {
    const id = setInterval(flush, POINTS_FLUSH_MS);
    return () => clearInterval(id);
  }, [flush]);

  function pointAt(event: React.PointerEvent<HTMLDivElement>): Point {
    const rect = event.currentTarget.getBoundingClientRect();
    return [
      normalizeCoordinate((event.clientX - rect.left) / rect.width),
      normalizeCoordinate((event.clientY - rect.top) / rect.height),
    ];
  }

  function endStroke() {
    const stroke = strokeRef.current;
    if (!stroke) return;
    flush();
    strokeRef.current = null;
    // Too big to send (never at these caps) — the partial points stand.
    send({
      kind: "stroke-end",
      shareSid,
      strokeId: stroke.id,
      points: finishStroke(stroke.points),
    });
  }

  return (
    <div
      className="absolute inset-0"
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        const at = pointAt(event);
        if (tool === "pen") {
          strokeRef.current = {
            id: crypto.randomUUID(),
            points: [at],
            flushed: 0,
          };
        } else {
          laserRef.current = { at, sent: false };
        }
      }}
      onPointerMove={(event) => {
        const at = pointAt(event);
        if (tool === "laser") {
          const previous = laserRef.current?.at;
          if (!previous || previous[0] !== at[0] || previous[1] !== at[1]) {
            laserRef.current = { at, sent: false };
          }
          return;
        }
        const stroke = strokeRef.current;
        if (!stroke) return;
        const last = stroke.points.at(-1);
        if (last && last[0] === at[0] && last[1] === at[1]) return;
        stroke.points.push(at);
      }}
      onPointerUp={endStroke}
      onPointerCancel={endStroke}
      onLostPointerCapture={endStroke}
    />
  );
}
