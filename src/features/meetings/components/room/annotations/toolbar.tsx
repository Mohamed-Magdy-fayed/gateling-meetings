"use client";

import {
  EraserIcon,
  PenLineIcon,
  PointerIcon,
  Trash2Icon,
  Undo2Icon,
} from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";

import { useTranslation } from "@/features/core/i18n/client";
import { cn } from "@/lib/utils";

export type Tool = "none" | "laser" | "pen";

type ToolbarProps = {
  tool: Tool;
  onToolChange: (tool: Tool) => void;
  canUndo: boolean;
  onUndo: () => void;
  onClearMine: () => void;
  /** Host only. */
  onClearAll?: () => void;
};

/**
 * Collapsed to one pen button at the share tile's top-start corner (the
 * pin keeps top-end); expands inside the tile — a row from `sm` up, a
 * column below. Tapping the active tool again returns to no tool and
 * collapses it (the touch equivalent of Esc).
 */
export function AnnotationToolbar({
  tool,
  onToolChange,
  canUndo,
  onUndo,
  onClearMine,
  onClearAll,
}: ToolbarProps) {
  const { t } = useTranslation();
  const [isConfirmingClearAll, setIsConfirmingClearAll] = useState(false);
  const clearAllRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isConfirmingClearAll) cancelRef.current?.focus();
  }, [isConfirmingClearAll]);

  function select(next: Tool) {
    setIsConfirmingClearAll(false);
    onToolChange(tool === next ? "none" : next);
  }
  function closeConfirm() {
    setIsConfirmingClearAll(false);
    setTimeout(() => clearAllRef.current?.focus(), 0);
  }

  if (tool === "none") {
    return (
      <div className="absolute top-2 start-2 z-20">
        <ToolButton
          label={t("meetings.annotate.open")}
          onClick={() => onToolChange("pen")}
        >
          <PenLineIcon />
        </ToolButton>
      </div>
    );
  }

  return (
    <div
      role="toolbar"
      aria-label={t("meetings.annotate.tools")}
      className="absolute top-2 start-2 z-20 flex flex-col gap-1 rounded-lg bg-black/60 p-1 backdrop-blur motion-safe:animate-in motion-safe:fade-in sm:flex-row"
    >
      <ToolButton
        label={t("meetings.annotate.laser")}
        pressed={tool === "laser"}
        onClick={() => select("laser")}
      >
        <PointerIcon />
      </ToolButton>
      <ToolButton
        label={t("meetings.annotate.pen")}
        pressed={tool === "pen"}
        onClick={() => select("pen")}
      >
        <PenLineIcon />
      </ToolButton>
      <ToolButton
        label={t("meetings.annotate.undo")}
        disabled={!canUndo || tool === "laser"}
        onClick={onUndo}
      >
        <Undo2Icon className="rtl:-scale-x-100" />
      </ToolButton>
      <ToolButton
        label={t("meetings.annotate.clearMine")}
        onClick={onClearMine}
      >
        <EraserIcon />
      </ToolButton>
      {onClearAll &&
        (isConfirmingClearAll ? (
          // biome-ignore lint/a11y/noStaticElementInteractions: Esc inside the inline confirm cancels it.
          <div
            className="flex items-center gap-1 rounded-md bg-black/60 px-1 text-xs text-white"
            onKeyDown={(event) => {
              if (event.key !== "Escape") return;
              event.stopPropagation();
              closeConfirm();
            }}
          >
            <span className="px-1">
              {t("meetings.annotate.clearAllConfirm")}
            </span>
            <button
              type="button"
              onClick={() => {
                setIsConfirmingClearAll(false);
                onClearAll();
              }}
              className="min-h-11 rounded-md bg-destructive px-2 font-medium text-white hover:bg-destructive/90 focus-visible:outline-2 focus-visible:outline-white sm:min-h-8"
            >
              {t("meetings.annotate.confirmClear")}
            </button>
            <button
              ref={cancelRef}
              type="button"
              onClick={closeConfirm}
              className="min-h-11 rounded-md px-2 font-medium hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-primary sm:min-h-8"
            >
              {t("meetings.annotate.cancel")}
            </button>
          </div>
        ) : (
          <ToolButton
            ref={clearAllRef}
            label={t("meetings.annotate.clearAll")}
            onClick={() => setIsConfirmingClearAll(true)}
            className="text-destructive"
          >
            <Trash2Icon />
          </ToolButton>
        ))}
    </div>
  );
}

function ToolButton({
  label,
  pressed,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<"button">, "aria-label" | "aria-pressed"> & {
  label: string;
  pressed?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      {...props}
      className={cn(
        "grid size-11 place-items-center rounded-md bg-black/40 text-white backdrop-blur transition-colors hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-40 sm:size-8 [&_svg]:size-4",
        pressed && "bg-primary text-primary-foreground hover:bg-primary/90",
        className,
      )}
    >
      {children}
    </button>
  );
}
