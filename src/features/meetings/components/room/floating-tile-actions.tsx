"use client";

import { useTrackMutedIndicator } from "@livekit/components-react";
import { type Participant, Track } from "livekit-client";
import {
  ArrowLeftIcon,
  HandIcon,
  MicIcon,
  MicOffIcon,
  MoreHorizontalIcon,
  UserXIcon,
  VideoIcon,
  VideoOffIcon,
} from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";

import { Spinner } from "@/components/ui/spinner";
import { useTranslation } from "@/features/core/i18n/client";
import { cn } from "@/lib/utils";
import { isolate } from "./bidi";
import { useHandRaised } from "./use-hand-raise";
import {
  type HostParticipantActions,
  useHostParticipantActions,
} from "./use-host-participant-actions";

type View = "strip" | "manage" | "confirm";

/**
 * The host's controls on one remote tile inside the floating window.
 * Always visible (hover is unreliable in a small always-on-top window),
 * icon-only (the icon shows the current state, the label names the
 * action), and never portalled: menus, popovers and dialogs would open in
 * the meeting tab, not in the floating window. Narrower than 10rem, the
 * strip collapses into one "Manage" button that swaps in an inline list.
 */
export function FloatingTileActions({
  code,
  participant,
}: {
  code: string;
  participant: Participant;
}) {
  const { t } = useTranslation();
  const actions = useHostParticipantActions(code, participant);
  const [view, setView] = useState<View>("strip");
  const name = isolate(participant.name || participant.identity);

  const removeButtonRef = useRef<HTMLButtonElement>(null);
  const manageButtonRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLButtonElement | null>(null);

  function openConfirm(from: HTMLButtonElement | null) {
    returnFocusRef.current = from;
    setView("confirm");
  }
  function closeConfirm() {
    setView("strip");
    // Wait for the strip to render back, then return focus where it was.
    requestAnimationFrame(() =>
      (
        returnFocusRef.current ??
        removeButtonRef.current ??
        manageButtonRef.current
      )?.focus(),
    );
  }

  if (actions.error) {
    return (
      <Scrim className="bottom-9 end-1.5 max-w-[calc(100%-0.75rem)] gap-1.5 px-2 py-1">
        <p role="status" className="min-w-0 text-[0.6875rem] text-white">
          {actions.error.message}
        </p>
        <StripButton
          label={t("meetings.host.retry")}
          onClick={actions.error.retry}
          className="w-auto px-1.5 text-[0.6875rem] font-medium"
        >
          {t("meetings.host.retry")}
        </StripButton>
      </Scrim>
    );
  }

  if (view === "confirm") {
    return (
      <RemoveConfirm
        name={name}
        onCancel={closeConfirm}
        onConfirm={() => {
          setView("strip");
          actions.remove();
        }}
      />
    );
  }

  if (view === "manage") {
    return (
      <div className="absolute inset-0 z-10 flex flex-col gap-1 overflow-y-auto bg-neutral-900/95 p-1.5 text-xs text-white">
        <button
          type="button"
          onClick={() => {
            setView("strip");
            requestAnimationFrame(() => manageButtonRef.current?.focus());
          }}
          className="flex items-center gap-1.5 rounded-md px-1.5 py-1 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-primary"
        >
          <ArrowLeftIcon className="size-3.5 rtl:-scale-x-100" aria-hidden />
          {t("meetings.host.back")}
        </button>
        <ActionButtons
          actions={actions}
          participant={participant}
          name={name}
          layout="list"
          onRemove={(from) => openConfirm(from)}
        />
      </div>
    );
  }

  return (
    <div className="pointer-events-none absolute inset-0 @container">
      <Scrim className="pointer-events-auto bottom-9 end-1.5 gap-0.5 p-0.5 @max-[10rem]:hidden">
        <ActionButtons
          actions={actions}
          participant={participant}
          name={name}
          layout="strip"
          removeRef={removeButtonRef}
          onRemove={(from) => openConfirm(from)}
        />
      </Scrim>
      <Scrim className="pointer-events-auto bottom-9 end-1.5 hidden p-0.5 @max-[10rem]:flex">
        <StripButton
          ref={manageButtonRef}
          label={t("meetings.host.manage", { name })}
          onClick={() => setView("manage")}
        >
          <MoreHorizontalIcon className="size-4" aria-hidden />
        </StripButton>
      </Scrim>
    </div>
  );
}

function ActionButtons({
  actions,
  participant,
  name,
  layout,
  removeRef,
  onRemove,
}: {
  actions: HostParticipantActions;
  participant: Participant;
  name: string;
  layout: "strip" | "list";
  removeRef?: React.Ref<HTMLButtonElement>;
  onRemove: (from: HTMLButtonElement | null) => void;
}) {
  const { t } = useTranslation();
  const isHandRaised = useHandRaised(participant);
  const { isMuted: isMicOff } = useTrackMutedIndicator({
    participant,
    source: Track.Source.Microphone,
  });
  const { isMuted: isCameraOff } = useTrackMutedIndicator({
    participant,
    source: Track.Source.Camera,
  });
  const asList = layout === "list";
  const Button = asList ? ListButton : StripButton;

  const micLabel = actions.asked.has("unmute")
    ? t("meetings.host.asked", { name })
    : isMicOff
      ? t("meetings.host.askUnmute", { name })
      : t("meetings.host.muteMic", { name });
  const cameraLabel = actions.asked.has("camera")
    ? t("meetings.host.asked", { name })
    : isCameraOff
      ? t("meetings.host.askCamera", { name })
      : t("meetings.host.turnOffCamera", { name });

  return (
    <>
      <Button
        label={micLabel}
        disabled={actions.pending.has("mic") || actions.asked.has("unmute")}
        onClick={isMicOff ? actions.askToUnmute : actions.muteMicrophone}
      >
        <StateIcon
          pending={actions.pending.has("mic")}
          isAsk={isMicOff}
          icon={
            isMicOff ? (
              <MicOffIcon className="size-4 text-destructive" aria-hidden />
            ) : (
              <MicIcon className="size-4" aria-hidden />
            )
          }
        />
        {asList && <span>{micLabel}</span>}
      </Button>
      <Button
        label={cameraLabel}
        disabled={actions.pending.has("camera") || actions.asked.has("camera")}
        onClick={isCameraOff ? actions.askToTurnOnCamera : actions.muteCamera}
      >
        <StateIcon
          pending={actions.pending.has("camera")}
          isAsk={isCameraOff}
          icon={
            isCameraOff ? (
              <VideoOffIcon className="size-4" aria-hidden />
            ) : (
              <VideoIcon className="size-4" aria-hidden />
            )
          }
        />
        {asList && <span>{cameraLabel}</span>}
      </Button>
      {isHandRaised && (
        <Button
          label={t("meetings.host.lowerHandOf", { name })}
          disabled={actions.pending.has("hand")}
          onClick={actions.lowerHand}
          className="text-warning"
        >
          <StateIcon
            pending={actions.pending.has("hand")}
            icon={<HandIcon className="size-4" aria-hidden />}
          />
          {asList && <span>{t("meetings.host.lowerHandOf", { name })}</span>}
        </Button>
      )}
      <Button
        ref={removeRef}
        label={t("meetings.host.removeOf", { name })}
        disabled={actions.pending.has("remove")}
        onClick={(event) => onRemove(event.currentTarget)}
        className="text-destructive"
      >
        <StateIcon
          pending={actions.pending.has("remove")}
          icon={<UserXIcon className="size-4" aria-hidden />}
        />
        {asList && <span>{t("meetings.host.removeOf", { name })}</span>}
      </Button>
    </>
  );
}

/** Current-state icon; a hand badge marks "ask" actions, a spinner pending ones. */
function StateIcon({
  pending,
  isAsk = false,
  icon,
}: {
  pending: boolean;
  isAsk?: boolean;
  icon: ReactNode;
}) {
  if (pending) return <Spinner className="size-4" />;
  return (
    <span className="relative grid place-items-center">
      {icon}
      {isAsk && (
        <HandIcon
          aria-hidden
          className="absolute -end-1.5 -bottom-1 size-2.5 rounded-full bg-warning p-px text-warning-foreground"
        />
      )}
    </span>
  );
}

function RemoveConfirm({
  name,
  onCancel,
  onConfirm,
}: {
  name: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => cancelRef.current?.focus(), []);
  const onEscape = (event: React.KeyboardEvent) => {
    if (event.key !== "Escape") return;
    event.stopPropagation();
    onCancel();
  };

  return (
    <fieldset
      aria-label={t("meetings.host.removeConfirm", { name })}
      className="absolute inset-x-1.5 bottom-9 z-10 m-0 flex min-w-0 flex-wrap items-center gap-1.5 rounded-md border-0 bg-black/70 p-1.5 text-xs text-white"
    >
      <span className="min-w-0 flex-1 truncate">
        {t("meetings.host.removeConfirm", { name })}
      </span>
      <button
        type="button"
        onClick={onConfirm}
        onKeyDown={onEscape}
        className="rounded-md bg-destructive px-2 py-1 font-medium text-white hover:bg-destructive/90 focus-visible:outline-2 focus-visible:outline-white"
      >
        {t("meetings.host.confirmRemove")}
      </button>
      <button
        ref={cancelRef}
        type="button"
        onClick={onCancel}
        onKeyDown={onEscape}
        className="rounded-md px-2 py-1 font-medium hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-primary"
      >
        {t("meetings.host.cancel")}
      </button>
    </fieldset>
  );
}

function Scrim({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "absolute z-10 flex items-center rounded-md bg-black/50 text-white backdrop-blur",
        className,
      )}
    >
      {children}
    </div>
  );
}

type ActionButtonProps = Omit<React.ComponentProps<"button">, "aria-label"> & {
  label: string;
};

function StripButton({ label, className, ...props }: ActionButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...props}
      className={cn(
        "grid size-7 shrink-0 place-items-center rounded-md transition-colors hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
    />
  );
}

function ListButton({ label, className, ...props }: ActionButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      {...props}
      className={cn(
        "flex items-center gap-2 rounded-md px-1.5 py-1 text-start hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
    />
  );
}
