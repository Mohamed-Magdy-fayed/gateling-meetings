"use client";

import { useTrackToggle } from "@livekit/components-react";
import { Track } from "livekit-client";
import {
  HandIcon,
  MessageSquareIcon,
  MicIcon,
  MicOffIcon,
  PhoneOffIcon,
  ScreenShareIcon,
  ScreenShareOffIcon,
  UsersIcon,
  VideoIcon,
  VideoOffIcon,
} from "lucide-react";
import { type ReactNode, useEffect } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTranslation } from "@/features/core/i18n/client";
import { cn } from "@/lib/utils";
import { ReactionPicker } from "./reactions";
import { useLocalHandRaise } from "./use-hand-raise";

export type SidePanel = "chat" | "participants" | null;

type ControlBarProps = {
  isHost: boolean;
  canShareScreen: boolean;
  participantCount: number;
  unreadChat: number;
  panel: SidePanel;
  onTogglePanel: (panel: Exclude<SidePanel, null>) => void;
  onLeave: () => void;
  onEndForAll: () => void;
  onReact: (emoji: string) => void;
};

export function ControlBar({
  isHost,
  canShareScreen,
  participantCount,
  unreadChat,
  panel,
  onTogglePanel,
  onLeave,
  onEndForAll,
  onReact,
}: ControlBarProps) {
  const { t } = useTranslation();
  const hand = useLocalHandRaise();

  const mic = useTrackToggle({ source: Track.Source.Microphone });
  const camera = useTrackToggle({ source: Track.Source.Camera });
  const screen = useTrackToggle({
    source: Track.Source.ScreenShare,
    captureOptions: { audio: true, selfBrowserSurface: "include" },
  });

  // Keyboard shortcuts: M (mic) / V (camera) — but never while typing.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        target?.closest("input, textarea, [contenteditable=true]")
      ) {
        return;
      }
      if (event.key === "m" || event.key === "M") mic.toggle();
      if (event.key === "v" || event.key === "V") camera.toggle();
      if (event.key === "h" || event.key === "H") hand.toggle();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mic.toggle, camera.toggle, hand.toggle]);

  return (
    <div className="flex items-center justify-center gap-2 px-3 py-3 sm:gap-3">
      <ControlButton
        label={
          mic.enabled ? t("meetings.room.micOn") : t("meetings.room.micOff")
        }
        active={mic.enabled}
        pending={mic.pending}
        onClick={() => mic.toggle()}
        danger={!mic.enabled}
      >
        {mic.enabled ? <MicIcon /> : <MicOffIcon />}
      </ControlButton>

      <ControlButton
        label={
          camera.enabled ? t("meetings.room.camOn") : t("meetings.room.camOff")
        }
        active={camera.enabled}
        pending={camera.pending}
        onClick={() => camera.toggle()}
        danger={!camera.enabled}
      >
        {camera.enabled ? <VideoIcon /> : <VideoOffIcon />}
      </ControlButton>

      {canShareScreen && (
        <ControlButton
          label={
            screen.enabled
              ? t("meetings.room.stopSharing")
              : t("meetings.room.shareScreen")
          }
          active={screen.enabled}
          pending={screen.pending}
          onClick={() => screen.toggle()}
          highlight={screen.enabled}
          className="hidden sm:grid"
        >
          {screen.enabled ? <ScreenShareOffIcon /> : <ScreenShareIcon />}
        </ControlButton>
      )}

      <ControlButton
        label={
          hand.isRaised
            ? t("meetings.room.lowerHand")
            : t("meetings.room.raiseHand")
        }
        active
        onClick={() => hand.toggle()}
        highlight={hand.isRaised}
      >
        <HandIcon />
      </ControlButton>

      <ReactionPicker onReact={onReact} />

      <span className="mx-1 hidden h-6 w-px bg-white/10 sm:block" />

      <ControlButton
        label={t("meetings.room.participants")}
        active
        onClick={() => onTogglePanel("participants")}
        highlight={panel === "participants"}
        badge={participantCount}
      >
        <UsersIcon />
      </ControlButton>

      <ControlButton
        label={t("meetings.room.chat")}
        active
        onClick={() => onTogglePanel("chat")}
        highlight={panel === "chat"}
        badge={unreadChat > 0 ? unreadChat : undefined}
        badgeAccent={unreadChat > 0}
      >
        <MessageSquareIcon />
      </ControlButton>

      <span className="mx-1 hidden h-6 w-px bg-white/10 sm:block" />

      {isHost ? (
        <AlertDialog>
          <AlertDialogTrigger
            render={
              <Button
                variant="destructive"
                aria-label={t("meetings.room.endForAll")}
                className="h-12 rounded-full bg-destructive px-5 text-white hover:bg-destructive/90"
              />
            }
          >
            <PhoneOffIcon data-icon="inline-start" />
            <span className="hidden sm:inline">
              {t("meetings.room.endForAll")}
            </span>
          </AlertDialogTrigger>
          <AlertDialogContent className="dark">
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t("meetings.room.endConfirmTitle")}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t("meetings.room.endConfirmLead")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("actions.cancel")}</AlertDialogCancel>
              <AlertDialogAction
                onClick={onEndForAll}
                className="bg-destructive text-white hover:bg-destructive/90"
              >
                {t("meetings.room.endForAll")}
              </AlertDialogAction>
              <Button variant="ghost" onClick={onLeave}>
                {t("meetings.room.leave")}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : (
        <Button
          variant="destructive"
          aria-label={t("meetings.room.leave")}
          className="h-12 rounded-full bg-destructive px-5 text-white hover:bg-destructive/90"
          onClick={onLeave}
        >
          <PhoneOffIcon data-icon="inline-start" />
          <span className="hidden sm:inline">{t("meetings.room.leave")}</span>
        </Button>
      )}
    </div>
  );
}

type ControlButtonProps = {
  label: string;
  active: boolean;
  pending?: boolean;
  danger?: boolean;
  highlight?: boolean;
  badge?: number;
  badgeAccent?: boolean;
  onClick: () => void;
  className?: string;
  children: ReactNode;
};

function ControlButton({
  label,
  active,
  pending,
  danger,
  highlight,
  badge,
  badgeAccent,
  onClick,
  className,
  children,
}: ControlButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            onClick={onClick}
            disabled={pending}
            aria-pressed={active}
            aria-label={label}
            className={cn(
              "relative grid size-12 place-items-center rounded-full border transition-all ease-spring hover:-translate-y-px active:translate-y-0 active:scale-95 disabled:opacity-60 [&_svg]:size-5",
              danger
                ? "border-transparent bg-destructive text-white hover:bg-destructive/90"
                : highlight
                  ? "border-primary/40 bg-primary/20 text-primary hover:bg-primary/30"
                  : "border-white/10 bg-white/[0.06] text-white hover:bg-white/[0.12]",
              className,
            )}
          />
        }
      >
        {children}
        {badge != null && (
          <span
            className={cn(
              "absolute -top-1 -end-1 grid min-w-5 place-items-center rounded-full px-1 text-[0.625rem] font-semibold tabular-nums",
              badgeAccent
                ? "bg-primary text-primary-foreground"
                : "bg-white/15 text-white",
            )}
          >
            {badge}
          </span>
        )}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
