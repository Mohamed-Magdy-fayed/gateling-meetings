"use client";

import {
  useLocalParticipant,
  useMediaDeviceSelect,
  useRoomContext,
} from "@livekit/components-react";
import { MicIcon, MicOffIcon, Settings2Icon, XIcon } from "lucide-react";
import { useState } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTranslation } from "@/features/core/i18n/client";
import {
  type TrackHealthStatus,
  useDevicesOfKind,
  useTrackHealth,
} from "@/features/meetings/lib/media";
import { cn } from "@/lib/utils";
import { useLocalMicTrack } from "./use-local-mic-track";

type Problem = Extract<TrackHealthStatus, "silent" | "hardwareMuted" | "ended">;

const isProblem = (status: TrackHealthStatus): status is Problem =>
  status === "silent" || status === "hardwareMuted" || status === "ended";

/**
 * The in-room answer to "I can see my mic is on, why can't they hear me?".
 * The mic button only knows a track is *published*; this watches whether it
 * carries sound and says so — with the fix (another microphone) inline.
 *
 * Also the gentler cousin: app-muted but clearly talking → "you're muted".
 */
export function MicHealthBanner({ onOpenCheck }: { onOpenCheck: () => void }) {
  const { t } = useTranslation();
  const { isMicrophoneEnabled, localParticipant } = useLocalParticipant();
  const track = useLocalMicTrack();
  const health = useTrackHealth(track);
  // Dismissal is per problem: a new kind of trouble shows again.
  const [dismissed, setDismissed] = useState<Problem | null>(null);

  if (!track) return null;

  if (!isMicrophoneEnabled || health.isAppMuted) {
    if (!health.isSpeakingWhileMuted) return null;
    return (
      <Banner tone="info">
        <MicOffIcon className="size-4" />
        <span>{t("meetings.media.speakingWhileMuted")}</span>
        <BannerButton
          onClick={() => void localParticipant.setMicrophoneEnabled(true)}
        >
          <MicIcon className="size-3.5" />
          {t("meetings.media.unmute")}
        </BannerButton>
      </Banner>
    );
  }

  if (!isProblem(health.status) || dismissed === health.status) return null;
  const problem = health.status;

  return (
    <Banner tone="warning">
      <MicOffIcon className="size-4" />
      <span>{t(`meetings.media.banner.${problem}`)}</span>
      <SwitchMicMenu />
      <BannerButton onClick={onOpenCheck}>
        <Settings2Icon className="size-3.5" />
        {t("meetings.media.check")}
      </BannerButton>
      <button
        type="button"
        onClick={() => setDismissed(problem)}
        aria-label={t("meetings.media.banner.dismiss")}
        className="ms-1 grid size-6 place-items-center rounded-md transition-colors hover:bg-warning/20"
      >
        <XIcon className="size-3.5" />
      </button>
    </Banner>
  );
}

function SwitchMicMenu() {
  const { t } = useTranslation();
  const room = useRoomContext();
  const devices = useDevicesOfKind("audioinput");
  const { activeDeviceId, setActiveMediaDevice } = useMediaDeviceSelect({
    kind: "audioinput",
    room,
  });
  if (devices.length < 2) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<BannerButton />}>
        <MicIcon className="size-3.5" />
        {t("meetings.media.switchMic")}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" className="dark min-w-56">
        <DropdownMenuRadioGroup
          value={activeDeviceId}
          onValueChange={(value) => {
            if (typeof value === "string") void setActiveMediaDevice(value);
          }}
        >
          {devices.map((device, index) => (
            <DropdownMenuRadioItem
              key={device.deviceId}
              value={device.deviceId}
            >
              <span className="truncate">
                {device.label ||
                  `${t("meetings.media.microphone")} ${index + 1}`}
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Banner({
  tone,
  children,
}: {
  tone: "warning" | "info";
  children: React.ReactNode;
}) {
  return (
    <div
      role="status"
      className={cn(
        "flex shrink-0 flex-wrap items-center justify-center gap-x-3 gap-y-1 px-3 py-1.5 text-xs",
        tone === "warning"
          ? "bg-warning/20 text-warning"
          : "bg-primary/15 text-primary",
      )}
    >
      {children}
    </div>
  );
}

function BannerButton({ className, ...props }: React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-2 py-1 font-medium transition-colors hover:bg-current/10",
        className,
      )}
    />
  );
}
