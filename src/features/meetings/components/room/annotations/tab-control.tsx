"use client";

import { MouseIcon, ZoomInIcon, ZoomOutIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { useTranslation } from "@/features/core/i18n/client";
import type { ControllableCapture } from "../share-capture";
import { ToolButton } from "./toolbar";

type TabControlProps = {
  controller: ControllableCapture;
  /** The element over the shared frame whose wheel events scroll the tab. */
  surface: HTMLElement | null;
  isScrolling: boolean;
  onScrollingChange: (next: boolean) => void;
};

function readLevels(controller: ControllableCapture): number[] {
  try {
    return controller.getSupportedZoomLevels();
  } catch {
    // The capture isn't a tab (any more), or the session ended.
    return [];
  }
}

/**
 * Captured Surface Control, the way Meet does it: while presenting a tab,
 * scroll it with the wheel over your own share and zoom it from here —
 * without switching back to it. Each call must come from a click: the
 * browser asks for permission on the first one.
 */
export function TabControl({
  controller,
  surface,
  isScrolling,
  onScrollingChange,
}: TabControlProps) {
  const { t, locale } = useTranslation();
  const [levels] = useState(() => readLevels(controller));
  const [zoom, setZoom] = useState(controller.zoomLevel ?? null);

  useEffect(() => {
    const sync = () => setZoom(controller.zoomLevel ?? null);
    controller.addEventListener("zoomlevelchange", sync);
    return () => controller.removeEventListener("zoomlevelchange", sync);
  }, [controller]);

  // Stop forwarding when this unmounts (share stopped, Annotate view off).
  useEffect(
    () => () => {
      controller.forwardWheel(null).catch(() => {});
    },
    [controller],
  );

  const fail = () => toast.error(t("meetings.annotate.tabControl.denied"));

  async function toggleScrolling() {
    try {
      await controller.forwardWheel(isScrolling ? null : surface);
      onScrollingChange(!isScrolling);
    } catch {
      onScrollingChange(false);
      fail();
    }
  }

  const index = zoom == null ? -1 : levels.indexOf(zoom);
  const canZoomOut = index > 0;
  const canZoomIn = index >= 0 && index < levels.length - 1;
  async function stepZoom(step: -1 | 1) {
    const next = levels[index + step];
    if (next == null) return;
    try {
      await controller.setZoomLevel(next);
    } catch {
      fail();
    }
  }

  const percent =
    zoom == null
      ? null
      : new Intl.NumberFormat(locale === "ar" ? "ar-EG" : "en", {
          style: "percent",
        }).format(zoom / 100);

  return (
    <div
      role="toolbar"
      aria-label={t("meetings.annotate.tabControl.group")}
      className="absolute bottom-2 end-2 z-20 flex items-center gap-1 rounded-lg bg-black/60 p-1 text-white backdrop-blur"
    >
      <ToolButton
        label={
          isScrolling
            ? t("meetings.annotate.tabControl.scrollOn")
            : t("meetings.annotate.tabControl.scroll")
        }
        pressed={isScrolling}
        disabled={!surface}
        onClick={toggleScrolling}
      >
        <MouseIcon />
      </ToolButton>
      {levels.length > 0 && (
        <>
          <ToolButton
            label={t("meetings.annotate.tabControl.zoomOut")}
            disabled={!canZoomOut}
            onClick={() => stepZoom(-1)}
          >
            <ZoomOutIcon />
          </ToolButton>
          <span
            aria-live="polite"
            className="min-w-11 px-1 text-center text-xs tabular-nums"
          >
            {percent}
          </span>
          <ToolButton
            label={t("meetings.annotate.tabControl.zoomIn")}
            disabled={!canZoomIn}
            onClick={() => stepZoom(1)}
          >
            <ZoomInIcon />
          </ToolButton>
        </>
      )}
    </div>
  );
}
