"use client";

import type { LocalAudioTrack } from "livekit-client";
import { RefreshCwIcon, Settings2Icon } from "lucide-react";
import type { ReactElement, ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useTranslation } from "@/features/core/i18n/client";
import {
  type MediaPermissionState,
  useMediaPermission,
} from "@/features/meetings/lib/media";
import { cn } from "@/lib/utils";
import { DeviceSelect } from "../device-select";
import {
  type MediaSource,
  MediaStatusLine,
  useMediaStatus,
} from "./media-status";
import { MicLevelMeter } from "./mic-level-meter";
import { PermissionHint } from "./permission-hint";

export type DevicePicker = {
  deviceId: string;
  onChange: (deviceId: string) => void;
};

type MediaCheckDialogProps = {
  microphone: MediaSource & { track?: LocalAudioTrack; onRetry?: () => void };
  camera: MediaSource & { onRetry?: () => void };
  audioInput: DevicePicker;
  videoInput: DevicePicker;
  /** Only where the browser lets us choose an output (`setSinkId`). */
  audioOutput?: DevicePicker;
  /** Defaults to a small icon button; `null` for a fully controlled dialog. */
  trigger?: ReactElement | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** The room is always dark; the lobby follows the site theme. */
  className?: string;
};

/**
 * "Check audio & video": everything the browser will tell us about the
 * person's devices in one place — permission, the device actually open, and
 * whether sound is really coming through. Same panel in the lobby and in
 * the room, so someone who is told "we can't hear you" has one place to go.
 */
export function MediaCheckDialog({
  microphone,
  camera,
  audioInput,
  videoInput,
  audioOutput,
  trigger,
  open,
  onOpenChange,
  className,
}: MediaCheckDialogProps) {
  const { t } = useTranslation();
  const micPermission = useMediaPermission("microphone");
  const camPermission = useMediaPermission("camera");
  const micStatus = useMediaStatus(microphone);
  const camStatus = useMediaStatus(camera);
  const showHint = micStatus.showPermissionHint || camStatus.showPermissionHint;
  const showSystemHint = micStatus.showSystemHint;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger !== null && (
        <DialogTrigger
          render={
            trigger ?? (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("meetings.media.check")}
                title={t("meetings.media.check")}
              />
            )
          }
        >
          <Settings2Icon />
        </DialogTrigger>
      )}
      <DialogContent className={cn("sm:max-w-md", className)}>
        <DialogHeader>
          <DialogTitle>{t("meetings.media.check")}</DialogTitle>
          <DialogDescription>{t("meetings.media.checkLead")}</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-5">
          <Section
            title={t("meetings.media.microphone")}
            permission={micPermission}
          >
            <DeviceSelect
              kind="audioinput"
              value={audioInput.deviceId}
              onChange={audioInput.onChange}
              ariaLabel={t("meetings.media.microphone")}
              emptyLabel={t("meetings.prejoin.noMicrophone")}
            />
            {microphone.enabled && microphone.hasTrack && (
              <MicLevelMeter
                track={microphone.track}
                className="text-foreground"
              />
            )}
            <div className="flex items-start justify-between gap-3">
              <MediaStatusLine
                status={micStatus}
                isPending={microphone.isPending}
              />
              {microphone.failure && microphone.onRetry && (
                <RetryButton onClick={microphone.onRetry} />
              )}
            </div>
          </Section>

          <Section
            title={t("meetings.media.camera")}
            permission={camPermission}
          >
            <DeviceSelect
              kind="videoinput"
              value={videoInput.deviceId}
              onChange={videoInput.onChange}
              ariaLabel={t("meetings.media.camera")}
              emptyLabel={t("meetings.prejoin.noCamera")}
            />
            <div className="flex items-start justify-between gap-3">
              <MediaStatusLine
                status={camStatus}
                isPending={camera.isPending}
              />
              {camera.failure && camera.onRetry && (
                <RetryButton onClick={camera.onRetry} />
              )}
            </div>
          </Section>

          {audioOutput && (
            <Section title={t("meetings.media.speaker")}>
              <DeviceSelect
                kind="audiooutput"
                value={audioOutput.deviceId}
                onChange={audioOutput.onChange}
                ariaLabel={t("meetings.media.speaker")}
                emptyLabel={t("meetings.media.systemDefault")}
              />
            </Section>
          )}

          {(showHint || showSystemHint) && (
            <PermissionHint
              includeSystem={showSystemHint}
              className="space-y-2 rounded-lg bg-muted p-3 text-xs/relaxed text-muted-foreground"
            />
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

function Section({
  title,
  permission,
  children,
}: {
  title: string;
  permission?: MediaPermissionState;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">{title}</h3>
        {permission && <PermissionBadge state={permission} />}
      </div>
      {children}
    </section>
  );
}

const permissionVariant: Record<
  MediaPermissionState,
  "success" | "destructive" | "warning" | "outline"
> = {
  granted: "success",
  denied: "destructive",
  prompt: "warning",
  unsupported: "outline",
  unknown: "outline",
};

export function PermissionBadge({ state }: { state: MediaPermissionState }) {
  const { t } = useTranslation();
  return (
    <Badge
      variant={permissionVariant[state]}
      title={t("meetings.media.permission.label")}
    >
      {t(`meetings.media.permission.${state}`)}
    </Badge>
  );
}

function RetryButton({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <Button type="button" variant="outline" size="xs" onClick={onClick}>
      <RefreshCwIcon data-icon="inline-start" />
      {t("meetings.media.retry")}
    </Button>
  );
}
