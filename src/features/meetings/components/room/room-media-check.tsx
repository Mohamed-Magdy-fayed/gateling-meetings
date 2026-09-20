"use client";

import {
  useLocalParticipant,
  useMediaDeviceSelect,
  useRoomContext,
} from "@livekit/components-react";

import { useTranslation } from "@/features/core/i18n/client";
import {
  classifyMediaError,
  deviceLabel,
  useMediaDevices,
  useTrackHealth,
} from "@/features/meetings/lib/media";
import { MediaCheckDialog } from "../media/media-check-dialog";
import { useSupportsSpeakerSelection } from "./device-picker-menu";
import { useLocalMicTrack } from "./use-local-mic-track";

/**
 * The "Check audio & video" dialog, fed from the live room: what is
 * published, the last reason a device refused to open (LiveKit keeps that on
 * the local participant), and the room's active devices for the pickers.
 * Controlled, so the header button and the mic banner can both open it.
 */
export function RoomMediaCheck({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const room = useRoomContext();
  const {
    isMicrophoneEnabled,
    isCameraEnabled,
    lastMicrophoneError,
    lastCameraError,
    localParticipant,
  } = useLocalParticipant();
  const micTrack = useLocalMicTrack();
  const micHealth = useTrackHealth(micTrack);
  const { devices } = useMediaDevices();
  const supportsSpeaker = useSupportsSpeakerSelection();

  const mic = useMediaDeviceSelect({ kind: "audioinput", room });
  const cam = useMediaDeviceSelect({ kind: "videoinput", room });
  const speaker = useMediaDeviceSelect({ kind: "audiooutput", room });

  const micFailure = lastMicrophoneError
    ? classifyMediaError(lastMicrophoneError)
    : null;
  const camFailure = lastCameraError
    ? classifyMediaError(lastCameraError)
    : null;

  return (
    <MediaCheckDialog
      trigger={null}
      open={open}
      onOpenChange={onOpenChange}
      className="dark"
      microphone={{
        kind: "microphone",
        // "Wanted" = it's on, or the person tried and it failed.
        enabled: isMicrophoneEnabled || micFailure != null,
        isPending: false,
        failure: micFailure,
        health: micHealth,
        hasTrack: micTrack != null,
        deviceName: deviceLabel(
          mic.activeDeviceId,
          devices,
          "audioinput",
          t("meetings.media.microphone"),
        ),
        track: micTrack,
        onRetry: () => void localParticipant.setMicrophoneEnabled(true),
      }}
      camera={{
        kind: "camera",
        enabled: isCameraEnabled || camFailure != null,
        isPending: false,
        failure: camFailure,
        hasTrack: isCameraEnabled,
        deviceName: deviceLabel(
          cam.activeDeviceId,
          devices,
          "videoinput",
          t("meetings.media.camera"),
        ),
        onRetry: () => void localParticipant.setCameraEnabled(true),
      }}
      audioInput={{
        deviceId: mic.activeDeviceId,
        onChange: (id) => void mic.setActiveMediaDevice(id),
      }}
      videoInput={{
        deviceId: cam.activeDeviceId,
        onChange: (id) => void cam.setActiveMediaDevice(id),
      }}
      audioOutput={
        supportsSpeaker
          ? {
              deviceId: speaker.activeDeviceId,
              onChange: (id) => void speaker.setActiveMediaDevice(id),
            }
          : undefined
      }
    />
  );
}
