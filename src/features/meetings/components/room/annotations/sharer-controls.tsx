"use client";

import { useLocalParticipant } from "@livekit/components-react";
import { Track } from "livekit-client";
import { EyeIcon, PenLineIcon, PenOffIcon, Trash2Icon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useTranslation } from "@/features/core/i18n/client";
import { BannerButton } from "../share-controls";
import { useAnnotations, useAnnotationVersion } from "./use-annotations";

function useOwnShareSid() {
  const { localParticipant } = useLocalParticipant();
  return (
    localParticipant.getTrackPublication(Track.Source.ScreenShare)?.trackSid ??
    null
  );
}

/**
 * The sharer's switch for seeing their own share with everyone's ink on
 * their stage. Hosts and (while the room allows it) participants get
 * "Annotate"; a participant sharer with annotations off gets the
 * view-only "Show annotations".
 */
export function AnnotateToggle({
  isOn,
  onChange,
}: {
  isOn: boolean;
  onChange: (next: boolean) => void;
}) {
  const { t } = useTranslation();
  const annotations = useAnnotations();
  if (!annotations) return null;
  const label = isOn
    ? t("meetings.annotate.hideAnnotations")
    : annotations.canDraw
      ? t("meetings.annotate.annotate")
      : t("meetings.annotate.showAnnotations");
  return (
    <BannerButton aria-pressed={isOn} onClick={() => onChange(!isOn)}>
      {isOn ? (
        <PenOffIcon className="size-3.5" aria-hidden />
      ) : (
        <PenLineIcon className="size-3.5" aria-hidden />
      )}
      {label}
    </BannerButton>
  );
}

/** One line under the banner while the Annotate view is on. */
export function SharerAnnotateNotice() {
  const { t } = useTranslation();
  return (
    <p className="w-full text-center text-[0.6875rem] opacity-80">
      {t("meetings.annotate.sharerNotice")}
    </p>
  );
}

/**
 * "{n} people annotating" on the sharer's banner and floating window, so
 * a presenter looking at their real screen knows ink is happening. "Show"
 * turns on their Annotate view; the host can also clear everyone's ink.
 */
export function AnnotatingNotice({
  isAnnotating,
  onShow,
}: {
  isAnnotating: boolean;
  onShow: () => void;
}) {
  const { t } = useTranslation();
  const annotations = useAnnotations();
  useAnnotationVersion(annotations?.store);
  const shareSid = useOwnShareSid();
  const [isConfirming, setIsConfirming] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const clearRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (isConfirming) cancelRef.current?.focus();
  }, [isConfirming]);

  if (!annotations || !shareSid) return null;
  const count = annotations.store.annotators(
    shareSid,
    annotations.localIdentity,
  );
  if (count === 0) return null;

  function cancel() {
    setIsConfirming(false);
    setTimeout(() => clearRef.current?.focus(), 0);
  }

  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <span role="status">{t("meetings.annotate.annotating", { count })}</span>
      {!isAnnotating && (
        <BannerButton onClick={onShow}>
          <EyeIcon className="size-3.5" aria-hidden />
          {t("meetings.annotate.show")}
        </BannerButton>
      )}
      {annotations.isHost &&
        (isConfirming ? (
          // biome-ignore lint/a11y/noStaticElementInteractions: Esc inside the inline confirm cancels it.
          <span
            className="flex items-center gap-1"
            onKeyDown={(event) => {
              if (event.key !== "Escape") return;
              event.stopPropagation();
              cancel();
            }}
          >
            {t("meetings.annotate.clearAllConfirm")}
            <BannerButton
              className="text-destructive hover:bg-destructive/15"
              onClick={() => {
                setIsConfirming(false);
                annotations.send({ kind: "clear-all", shareSid });
              }}
            >
              {t("meetings.annotate.confirmClear")}
            </BannerButton>
            <BannerButton ref={cancelRef} onClick={cancel}>
              {t("meetings.annotate.cancel")}
            </BannerButton>
          </span>
        ) : (
          <BannerButton
            ref={clearRef}
            className="text-destructive hover:bg-destructive/15"
            onClick={() => setIsConfirming(true)}
          >
            <Trash2Icon className="size-3.5" aria-hidden />
            {t("meetings.annotate.clearAll")}
          </BannerButton>
        ))}
    </span>
  );
}
