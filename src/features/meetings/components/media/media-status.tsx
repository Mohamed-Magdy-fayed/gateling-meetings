"use client";

import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  Loader2Icon,
  MicOffIcon,
  XCircleIcon,
} from "lucide-react";

import { useTranslation } from "@/features/core/i18n/client";
import type { MediaFailure, TrackHealth } from "@/features/meetings/lib/media";
import { cn } from "@/lib/utils";

export type MediaKind = "microphone" | "camera";

export type MediaSource = {
  kind: MediaKind;
  /** The person wants it on. */
  enabled: boolean;
  isPending: boolean;
  failure: MediaFailure | null;
  /** Microphone only; cameras have no "silent". */
  health?: TrackHealth;
  /** Whether a track exists right now. */
  hasTrack: boolean;
  deviceName: string;
};

export type Tone = "neutral" | "ok" | "warn" | "error";

export type MediaStatus = {
  tone: Tone;
  text: string;
  /** Show the "unblock it in your browser" instructions. */
  showPermissionHint: boolean;
  /** Mention OS-level privacy too (allowed, yet silent). */
  showSystemHint: boolean;
};

/** One sentence that says what is really happening with a device. */
export function useMediaStatus(source: MediaSource): MediaStatus {
  const { t } = useTranslation();
  const { kind, enabled, isPending, failure, health, hasTrack, deviceName } =
    source;
  const none = { showPermissionHint: false, showSystemHint: false };

  if (!enabled) {
    return { tone: "neutral", text: t("meetings.media.status.off"), ...none };
  }
  if (failure) {
    return {
      tone: "error",
      text: t(`meetings.media.failure.${failure}.${kind}`),
      showPermissionHint: failure === "denied",
      showSystemHint: false,
    };
  }
  if (isPending || !hasTrack) {
    return {
      tone: "neutral",
      text: t("meetings.media.status.pending"),
      ...none,
    };
  }
  if (kind === "camera") {
    return { tone: "ok", text: t("meetings.media.status.cameraOn"), ...none };
  }
  switch (health?.status) {
    case "live":
      return { tone: "ok", text: t("meetings.media.status.live"), ...none };
    case "silent":
      return {
        tone: "warn",
        text: t("meetings.media.noSound", { device: deviceName }),
        showPermissionHint: false,
        showSystemHint: true,
      };
    case "hardwareMuted":
      return {
        tone: "warn",
        text: t("meetings.media.hardwareMuted"),
        ...none,
      };
    case "ended":
      return {
        tone: "error",
        text: t("meetings.media.disconnected", { device: deviceName }),
        ...none,
      };
    default:
      return {
        tone: "neutral",
        text: t("meetings.media.speakToTest"),
        ...none,
      };
  }
}

const toneClass: Record<Tone, string> = {
  neutral: "text-muted-foreground",
  ok: "text-success",
  warn: "text-warning",
  error: "text-destructive",
};

export function StatusIcon({
  tone,
  isPending,
  className,
}: {
  tone: Tone;
  isPending?: boolean;
  className?: string;
}) {
  const cls = cn("size-3.5 shrink-0", className);
  if (isPending) return <Loader2Icon className={cn(cls, "animate-spin")} />;
  switch (tone) {
    case "ok":
      return <CheckCircle2Icon className={cls} />;
    case "warn":
      return <AlertTriangleIcon className={cls} />;
    case "error":
      return <XCircleIcon className={cls} />;
    default:
      return <MicOffIcon className={cn(cls, "opacity-0")} aria-hidden />;
  }
}

/** Compact status text with a tone-coloured icon, for under a device picker. */
export function MediaStatusLine({
  status,
  isPending,
  className,
}: {
  status: MediaStatus;
  isPending?: boolean;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "flex items-start gap-1.5 text-xs/relaxed",
        toneClass[status.tone],
        className,
      )}
      role={
        status.tone === "warn" || status.tone === "error" ? "alert" : undefined
      }
    >
      <StatusIcon tone={status.tone} isPending={isPending} className="mt-0.5" />
      <span>{status.text}</span>
    </p>
  );
}
