"use client";

import {
  useMediaDeviceSelect,
  useRoomContext,
} from "@livekit/components-react";
import { supportsAudioOutputSelection } from "livekit-client";
import { ChevronUpIcon } from "lucide-react";
import { useSyncExternalStore } from "react";
import { toast } from "sonner";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTranslation } from "@/features/core/i18n/client";
import {
  classifyMediaError,
  useDevicesOfKind,
} from "@/features/meetings/lib/media";
import { cn } from "@/lib/utils";

const noop = () => () => {};
const serverFalse = () => false;

/** Output selection is a Chromium-only affair; the speaker list hides elsewhere. */
export function useSupportsSpeakerSelection(): boolean {
  return useSyncExternalStore(noop, supportsAudioOutputSelection, serverFalse);
}

type DevicePickerMenuProps = {
  /** Which lists to show, in order. */
  kinds: MediaDeviceKind[];
  label: string;
  className?: string;
};

/**
 * The little chevron next to a mic/camera button — Meet's "which device?"
 * affordance — so switching to the headset that actually works is one click
 * from where the problem shows up, not a trip to a settings page.
 */
export function DevicePickerMenu({
  kinds,
  label,
  className,
}: DevicePickerMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label={label}
            title={label}
            className={cn(
              "grid h-12 w-6 place-items-center rounded-full border border-white/10 bg-white/[0.06] text-white transition-colors hover:bg-white/[0.12] aria-expanded:bg-white/[0.12] [&_svg]:size-3.5",
              className,
            )}
          />
        }
      >
        <ChevronUpIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="center"
        side="top"
        className="dark min-w-56 max-w-[calc(100vw-2rem)]"
      >
        {kinds.map((kind, index) => (
          <DeviceGroup key={kind} kind={kind} withSeparator={index > 0} />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DeviceGroup({
  kind,
  withSeparator,
}: {
  kind: MediaDeviceKind;
  withSeparator: boolean;
}) {
  const { t } = useTranslation();
  const room = useRoomContext();
  const devices = useDevicesOfKind(kind);
  const { activeDeviceId, setActiveMediaDevice } = useMediaDeviceSelect({
    kind,
    room,
  });
  const supportsSpeaker = useSupportsSpeakerSelection();

  if (kind === "audiooutput" && !supportsSpeaker) return null;

  const title =
    kind === "audioinput"
      ? t("meetings.media.microphone")
      : kind === "videoinput"
        ? t("meetings.media.camera")
        : t("meetings.media.speaker");
  const empty =
    kind === "audioinput"
      ? t("meetings.prejoin.noMicrophone")
      : kind === "videoinput"
        ? t("meetings.prejoin.noCamera")
        : t("meetings.media.systemDefault");

  async function choose(deviceId: string) {
    try {
      await setActiveMediaDevice(deviceId);
    } catch (error) {
      const failure = classifyMediaError(error);
      toast.error(
        t(
          `meetings.media.failure.${failure}.${
            kind === "videoinput" ? "camera" : "microphone"
          }`,
        ),
      );
    }
  }

  return (
    <>
      {withSeparator && <DropdownMenuSeparator />}
      <DropdownMenuGroup>
        <DropdownMenuLabel>{title}</DropdownMenuLabel>
        {devices.length === 0 ? (
          <p className="px-2 py-1.5 text-xs text-muted-foreground">{empty}</p>
        ) : (
          <DropdownMenuRadioGroup
            value={activeDeviceId}
            onValueChange={(value) => {
              if (typeof value === "string") void choose(value);
            }}
          >
            {devices.map((device, index) => (
              <DropdownMenuRadioItem
                key={device.deviceId}
                value={device.deviceId}
              >
                <span className="truncate">
                  {device.label || `${title} ${index + 1}`}
                </span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        )}
      </DropdownMenuGroup>
    </>
  );
}
