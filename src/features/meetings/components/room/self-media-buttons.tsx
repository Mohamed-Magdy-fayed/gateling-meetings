"use client";

import { useTrackToggle } from "@livekit/components-react";
import { Track } from "livekit-client";
import {
  MicIcon,
  MicOffIcon,
  VideoIcon,
  VideoOffIcon,
  XIcon,
} from "lucide-react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { useTranslation } from "@/features/core/i18n/client";
import { classifyMediaError } from "@/features/meetings/lib/media";
import { cn } from "@/lib/utils";
import { handleMediaShortcut } from "./media-shortcuts";
import { PIP_TIMINGS } from "./pip-timings";
import { BannerButton } from "./share-controls";

type Device = "microphone" | "camera";
type PermissionGate = "granted" | "blocked" | "unknown";

/**
 * Whether the browser will open the device without a prompt. A prompt
 * cannot be answered from the floating window, so anything but "granted"
 * sends the person back to the meeting tab. Browsers without camera /
 * microphone permission queries (Firefox, some Safari) answer "unknown":
 * the toggle is tried, with a timeout hint as the fallback.
 */
function usePermission(device: Device): PermissionGate {
  const [gate, setGate] = useState<PermissionGate>("unknown");
  useEffect(() => {
    let status: PermissionStatus | null = null;
    let cancelled = false;
    const update = () => {
      if (status) setGate(status.state === "granted" ? "granted" : "blocked");
    };
    const name = device as PermissionName;
    navigator.permissions
      ?.query({ name })
      .then((result) => {
        if (cancelled) return;
        status = result;
        update();
        result.addEventListener("change", update);
      })
      .catch(() => setGate("unknown"));
    return () => {
      cancelled = true;
      status?.removeEventListener("change", update);
    };
  }, [device]);
  return gate;
}

/** One device's toggle with the floating window's inline error handling. */
function useSelfToggle(device: Device) {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const [isHinting, setIsHinting] = useState(false);
  const onDeviceError = useCallback(
    (cause: Error) =>
      setError(
        t(`meetings.media.failure.${classifyMediaError(cause)}.${device}`),
      ),
    [t, device],
  );
  const toggle = useTrackToggle({
    source:
      device === "microphone" ? Track.Source.Microphone : Track.Source.Camera,
    onDeviceError,
  });
  const permission = usePermission(device);

  // A permission granted in the meeting tab clears the hint.
  useEffect(() => {
    if (permission === "granted") setIsHinting(false);
  }, [permission]);

  // No permission API: a toggle that hangs is most likely a hidden prompt.
  useEffect(() => {
    if (!toggle.pending) return;
    const id = setTimeout(
      () => setIsHinting(true),
      PIP_TIMINGS.TOGGLE_TIMEOUT_MS,
    );
    return () => clearTimeout(id);
  }, [toggle.pending]);

  // Errors clear themselves.
  useEffect(() => {
    if (!error) return;
    const id = setTimeout(
      () => setError(null),
      PIP_TIMINGS.MEDIA_ERROR_DISMISS_MS,
    );
    return () => clearTimeout(id);
  }, [error]);

  const run = useCallback(() => {
    setError(null);
    // Turning on needs a prompt the floating window cannot show.
    if (!toggle.enabled && permission === "blocked") {
      setIsHinting(true);
      return;
    }
    void toggle.toggle().catch(() => setError(t("meetings.pip.actionFailed")));
  }, [toggle, permission, t]);

  return {
    enabled: toggle.enabled,
    pending: toggle.pending,
    blocked: isHinting,
    error,
    clearError: () => setError(null),
    toggle: run,
  };
}

/**
 * The sharer's own mic and camera in the floating window, with M / V bound
 * to the floating window's document (its keys never reach the meeting tab).
 * Errors render here, not as toasts: the meeting tab is behind the shared
 * screen. The render prop places the buttons and the error / hint line.
 */
export function SelfMediaButtons({
  pipDocument,
  children,
}: {
  pipDocument: Document | null;
  children: (parts: { buttons: ReactNode; notice: ReactNode }) => ReactNode;
}) {
  const { t } = useTranslation();
  const mic = useSelfToggle("microphone");
  const camera = useSelfToggle("camera");

  const togglesRef = useRef({ mic, camera });
  useEffect(() => {
    togglesRef.current = { mic, camera };
  });
  useEffect(() => {
    if (!pipDocument) return;
    const onKeyDown = (event: KeyboardEvent) =>
      handleMediaShortcut(event, togglesRef.current);
    pipDocument.addEventListener("keydown", onKeyDown);
    return () => pipDocument.removeEventListener("keydown", onKeyDown);
  }, [pipDocument]);

  const error = mic.error ?? camera.error;
  const isBlocked = mic.blocked || camera.blocked;

  const buttons = (
    <>
      <MediaButton
        label={
          mic.enabled ? t("meetings.room.micOn") : t("meetings.room.micOff")
        }
        state={mic}
        icon={mic.enabled ? <MicIcon /> : <MicOffIcon />}
      />
      <MediaButton
        label={
          camera.enabled ? t("meetings.room.camOn") : t("meetings.room.camOff")
        }
        state={camera}
        icon={camera.enabled ? <VideoIcon /> : <VideoOffIcon />}
      />
    </>
  );

  const notice = error ? (
    <p
      role="alert"
      className="flex shrink-0 items-center gap-1 rounded-md bg-destructive/15 px-2 py-1 text-xs text-destructive"
    >
      <span className="min-w-0 flex-1">{error}</span>
      <button
        type="button"
        aria-label={t("meetings.pip.dismiss")}
        className="grid size-8 place-items-center rounded-md hover:bg-current/15 focus-visible:outline-2 focus-visible:outline-current"
        onClick={() => {
          mic.clearError();
          camera.clearError();
        }}
      >
        <XIcon className="size-3.5" aria-hidden />
      </button>
    </p>
  ) : isBlocked ? (
    <p
      role="status"
      className="flex shrink-0 flex-wrap items-center gap-x-2 rounded-md bg-warning/15 px-2 py-1 text-xs text-warning"
    >
      {t("meetings.pip.permissionHint")}
      <BannerButton onClick={() => window.focus()}>
        {t("meetings.pip.backToTab")}
      </BannerButton>
    </p>
  ) : null;

  return children({ buttons, notice });
}

function MediaButton({
  label,
  state,
  icon,
}: {
  label: string;
  state: ReturnType<typeof useSelfToggle>;
  icon: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={state.enabled}
      title={label}
      disabled={state.pending}
      onClick={state.toggle}
      className={cn(
        "relative grid size-8 place-items-center rounded-md transition-colors focus-visible:outline-2 focus-visible:outline-current disabled:cursor-not-allowed disabled:opacity-60 [&_svg]:size-4",
        state.enabled
          ? "bg-muted text-foreground hover:bg-muted/70"
          : "bg-destructive/20 text-destructive hover:bg-destructive/30",
      )}
    >
      {icon}
      {state.blocked && (
        <span
          aria-hidden
          className="absolute top-0.5 end-0.5 size-2 rounded-full bg-warning"
        />
      )}
    </button>
  );
}
