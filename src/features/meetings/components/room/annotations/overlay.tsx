"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";

import { useTranslation } from "@/features/core/i18n/client";
import { cn } from "@/lib/utils";
import {
  LASER_FADE_MS,
  normalizeCoordinate,
  POINTS_FLUSH_MS,
  type Point,
} from "../protocol";
import { type Box, contentBox, inkColour } from "./geometry";
import { InkRecorder } from "./ink-recorder";
import { type Laser, laserFrame, type Stroke } from "./store";
import { AnnotationToolbar, type Tool } from "./toolbar";
import { useAnnotations, useAnnotationVersion } from "./use-annotations";
import { ownerWindow, useOwnerWindow } from "./use-owner-window";

type AnnotationsApi = NonNullable<ReturnType<typeof useAnnotations>>;

type AnnotationLayerProps = {
  /** The share tile's `<video>`; null while the share is paused. */
  video: HTMLVideoElement | null;
  shareSid: string;
  /** The local user's own share (the sharer's Annotate view). */
  isOwnShare: boolean;
  /** The tool selected on mount (the floating window starts on the laser). */
  initialTool?: Tool;
  /** `rail`: a compact vertical toolbar for the floating window. */
  toolbarVariant?: "default" | "rail";
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
    const observer = new (ownerWindow(video).ResizeObserver)(measure);
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
  // Not `instanceof HTMLElement`: the floating window has its own globals.
  return (
    target != null &&
    "closest" in target &&
    typeof target.closest === "function" &&
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
  initialTool = "none",
  toolbarVariant = "default",
}: AnnotationLayerProps) {
  const { t } = useTranslation();
  const annotations = useAnnotations();
  const win = useOwnerWindow(video);
  useAnnotationVersion(annotations?.store, win);
  const box = useContentBox(video);
  const [tool, setTool] = useState<Tool>(initialTool);
  const canDraw = annotations?.canDraw ?? false;
  const activeTool: Tool = canDraw && video ? tool : "none";

  // No tools while paused or when the host turns annotations off.
  useEffect(() => {
    if (!canDraw || !video) setTool("none");
  }, [canDraw, video]);

  // Keep the sharer's own preview from decoding frames nobody is looking at.
  // Keyed off the video's own document: the floating window's copy keeps
  // playing while the meeting tab is hidden.
  useEffect(() => {
    if (!isOwnShare || !video) return;
    const doc = video.ownerDocument;
    const sync = () => {
      if (doc.visibilityState === "hidden") video.pause();
      else void video.play().catch(() => {});
    };
    doc.addEventListener("visibilitychange", sync);
    return () => doc.removeEventListener("visibilitychange", sync);
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
    win.addEventListener("keydown", onKeyDown);
    return () => win.removeEventListener("keydown", onKeyDown);
  }, [activeTool, undo, win]);

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
          <Lasers lasers={snapshot.lasers} store={store} box={box} win={win} />
          {activeTool !== "none" && send && (
            <PointerInput
              key={shareSid}
              tool={activeTool}
              shareSid={shareSid}
              send={send}
              echo={annotations.echo}
              win={win}
            />
          )}
        </div>
      )}
      {activeTool !== "none" && (
        <div className="pointer-events-none absolute inset-0 rounded-xl ring-2 ring-primary ring-inset" />
      )}
      {canDraw ? (
        <AnnotationToolbar
          variant={toolbarVariant}
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

/**
 * Laser pointers: a head interpolated between samples on every frame,
 * a fading polyline trail, and the sender's name. The head and label move
 * with `transform` (compositor only). Rendered inside the `dir="ltr"` ink
 * layer: the physical `left-0`/`translate-x` here are frame coordinates, not
 * text direction — intentional, do not convert to logical properties.
 */
function Lasers({
  lasers,
  store,
  box,
  win,
}: {
  lasers: readonly Laser[];
  store: { expireLasers: (now: number) => boolean } | undefined;
  box: Box;
  win: Window;
}) {
  const [now, setNow] = useState(() => performance.now());
  const hasLasers = lasers.length > 0;
  // Animate only while a pointer is visible.
  useEffect(() => {
    if (!hasLasers || !store) return;
    let frame = win.requestAnimationFrame(function tick(time) {
      setNow(time);
      if (store.expireLasers(time)) frame = win.requestAnimationFrame(tick);
    });
    return () => win.cancelAnimationFrame(frame);
  }, [hasLasers, store, win]);

  return (
    <div className="pointer-events-none absolute inset-0">
      {lasers.map((laser) => {
        const frame = laserFrame(laser.trail, now);
        if (!frame) return null;
        const colour = inkColour(laser.owner);
        const [x, y] = frame.head;
        const opacity = Math.max(0, 1 - (now - frame.headT) / LASER_FADE_MS);
        const trail = frame.due
          .filter((entry) => now - entry.t < LASER_FADE_MS)
          .map((entry) => `${entry.at[0]},${entry.at[1]}`);
        trail.push(`${x},${y}`);
        const position = `translate(${x * box.width}px, ${y * box.height}px)`;
        return (
          <div key={laser.owner} data-annotation-laser style={{ opacity }}>
            {trail.length > 1 && (
              <svg
                className="absolute inset-0 size-full overflow-visible"
                viewBox="0 0 1 1"
                preserveAspectRatio="none"
                aria-hidden
              >
                <polyline
                  points={trail.join(" ")}
                  fill="none"
                  stroke={colour}
                  strokeOpacity={0.5}
                  strokeWidth={4}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
            )}
            <span
              className="absolute top-0 left-0 size-3.5 rounded-full shadow-[0_0_0_2px_rgb(0_0_0/0.6)] will-change-transform"
              style={{
                transform: `${position} translate(-50%, -50%)`,
                background: colour,
              }}
            />
            <span
              className="absolute top-0 left-0 will-change-transform"
              style={{ transform: position }}
            >
              <span
                className={cn(
                  "absolute -translate-y-1/2 whitespace-nowrap rounded-full border-2 bg-black/75 px-2 py-0.5 text-[0.6875rem] font-medium text-white shadow",
                  x > 0.75
                    ? "-translate-x-[calc(100%+0.75rem)]"
                    : "translate-x-3",
                )}
                style={{ borderColor: colour }}
              >
                <bdi>{laser.name}</bdi>
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Pointer input → `InkRecorder`: ink is echoed locally on every move and
 * sent in batches every `POINTS_FLUSH_MS`; see ink-recorder.ts.
 */
function PointerInput({
  tool,
  shareSid,
  send,
  echo,
  win,
}: {
  tool: Exclude<Tool, "none">;
  shareSid: string;
  send: AnnotationsApi["send"];
  echo: AnnotationsApi["echo"];
  win: Window;
}) {
  // The recorder lives as long as the tool; it reads the latest callbacks.
  const outRef = useRef({ send, echo });
  useEffect(() => {
    outRef.current = { send, echo };
  }, [send, echo]);
  const [recorder] = useState(
    () =>
      new InkRecorder(shareSid, {
        echo: (message) => outRef.current.echo(message),
        send: (message, options) => outRef.current.send(message, options),
        sendAndEcho: (message) => outRef.current.send(message),
      }),
  );

  useEffect(() => {
    // The owner window's timer: the meeting tab's timers are throttled
    // while it is hidden behind the shared screen.
    const id = win.setInterval(() => recorder.flush(), POINTS_FLUSH_MS);
    return () => {
      win.clearInterval(id);
      recorder.penUp();
      recorder.flush();
    };
  }, [recorder, win]);

  /** The move's coalesced samples (high-rate mice), in frame space. */
  function samplesOf(event: React.PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const native = event.nativeEvent;
    const events = native.getCoalescedEvents?.() ?? [];
    return (events.length > 0 ? events : [native]).map((sample) => ({
      at: [
        normalizeCoordinate((sample.clientX - rect.left) / rect.width),
        normalizeCoordinate((sample.clientY - rect.top) / rect.height),
      ] as Point,
      t: sample.timeStamp,
    }));
  }

  return (
    <div
      data-annotation-input
      className="absolute inset-0"
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          // Pointer not active in this document (floating window edge cases):
          // draw without capture rather than dropping the stroke.
        }
        const samples = samplesOf(event);
        const at = samples.at(-1)?.at;
        if (!at) return;
        if (tool === "pen") recorder.penDown(at);
        else recorder.laserMove(samples);
      }}
      onPointerMove={(event) => {
        const samples = samplesOf(event);
        if (tool === "laser") recorder.laserMove(samples);
        else recorder.penMove(samples.map((sample) => sample.at));
      }}
      onPointerUp={() => recorder.penUp()}
      onPointerCancel={() => recorder.penUp()}
      onLostPointerCapture={() => recorder.penUp()}
    />
  );
}
