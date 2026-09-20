"use client";

import { usePersistentUserChoices } from "@livekit/components-react";
import {
  AlertTriangleIcon,
  CopyIcon,
  MicIcon,
  MicOffIcon,
  Share2Icon,
  VideoIcon,
  VideoOffIcon,
} from "lucide-react";
import Link from "next/link";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@/features/core/i18n/client";
import {
  deviceLabel,
  resolveDeviceId,
  useMediaDevices,
  usePreviewTrack,
  useTrackHealth,
} from "@/features/meetings/lib/media";
import { shareLink, useCanShare } from "@/features/meetings/lib/share-link";
import { cn } from "@/lib/utils";
import { DeviceSelect } from "./device-select";
import { MediaCheckDialog } from "./media/media-check-dialog";
import { MediaStatusLine, useMediaStatus } from "./media/media-status";
import { MicLevelMeter } from "./media/mic-level-meter";
import { PermissionHint } from "./media/permission-hint";
import type { MeetingSummary, Viewer } from "./meeting-client";

export type PreJoinValues = {
  displayName: string;
  passcode: string;
  audioEnabled: boolean;
  videoEnabled: boolean;
  audioDeviceId: string;
  videoDeviceId: string;
};

type PreJoinProps = {
  meeting: MeetingSummary;
  viewer: Viewer;
  title: string;
  /** An invite link is in hand: the passcode field is not needed. */
  hasInvite?: boolean;
  isJoining: boolean;
  error: string | null;
  onJoin: (values: PreJoinValues) => void;
};

/**
 * Meet-style lobby: a live camera preview with device toggles on one side,
 * the "who are you / join" form on the other. Device choices persist in
 * localStorage (via LiveKit's `usePersistentUserChoices`) so a returning
 * person lands with their last camera and mic already selected.
 */
export function PreJoin({
  meeting,
  viewer,
  title,
  hasInvite = false,
  isJoining,
  error,
  onJoin,
}: PreJoinProps) {
  const { t } = useTranslation();
  const {
    userChoices,
    saveAudioInputEnabled,
    saveVideoInputEnabled,
    saveAudioInputDeviceId,
    saveVideoInputDeviceId,
    saveUsername,
  } = usePersistentUserChoices({
    defaults: { username: viewer.defaultName },
  });

  // A name the sending system supplied (SSO link) wins until the person
  // edits it; otherwise a signed-in host's account name wins over an empty
  // saved choice, but a name typed last time (guest or host) wins over that.
  const [nameOverride, setNameOverride] = useState<string | null>(
    viewer.presetName || null,
  );
  const username = nameOverride ?? (userChoices.username || viewer.defaultName);

  const [passcode, setPasscode] = useState("");
  const [nameError, setNameError] = useState(false);

  // A remembered device id may point at last week's headset. Open the device
  // that exists *today* and remember that instead, so the room opens the same
  // one the person saw working here.
  const { devices, isLoaded: devicesLoaded } = useMediaDevices();
  const audioDeviceId = resolveDeviceId(
    userChoices.audioDeviceId,
    devices,
    "audioinput",
  );
  const videoDeviceId = resolveDeviceId(
    userChoices.videoDeviceId,
    devices,
    "videoinput",
  );
  useEffect(() => {
    if (!devicesLoaded) return;
    if (audioDeviceId !== userChoices.audioDeviceId) {
      saveAudioInputDeviceId(audioDeviceId);
    }
    if (videoDeviceId !== userChoices.videoDeviceId) {
      saveVideoInputDeviceId(videoDeviceId);
    }
  }, [
    devicesLoaded,
    audioDeviceId,
    videoDeviceId,
    userChoices.audioDeviceId,
    userChoices.videoDeviceId,
    saveAudioInputDeviceId,
    saveVideoInputDeviceId,
  ]);

  const video = usePreviewTrack(
    "videoinput",
    userChoices.videoEnabled,
    videoDeviceId,
  );
  const audio = usePreviewTrack(
    "audioinput",
    userChoices.audioEnabled,
    audioDeviceId,
  );
  const audioHealth = useTrackHealth(audio.track);

  // What the browser *actually* opened, when we asked for "default".
  useEffect(() => {
    if (audio.actualDeviceId && !userChoices.audioDeviceId) {
      saveAudioInputDeviceId(audio.actualDeviceId);
    }
  }, [audio.actualDeviceId, userChoices.audioDeviceId, saveAudioInputDeviceId]);
  useEffect(() => {
    if (video.actualDeviceId && !userChoices.videoDeviceId) {
      saveVideoInputDeviceId(video.actualDeviceId);
    }
  }, [video.actualDeviceId, userChoices.videoDeviceId, saveVideoInputDeviceId]);

  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const element = videoRef.current;
    const track = video.track;
    if (!element || !track) return;
    track.attach(element);
    return () => {
      track.detach(element);
    };
  }, [video.track]);

  const micName = deviceLabel(
    audioDeviceId,
    devices,
    "audioinput",
    t("meetings.media.microphone"),
  );
  const camName = deviceLabel(
    videoDeviceId,
    devices,
    "videoinput",
    t("meetings.media.camera"),
  );
  const micSource = {
    kind: "microphone" as const,
    enabled: userChoices.audioEnabled,
    isPending: audio.isPending,
    failure: audio.failure,
    health: audioHealth,
    hasTrack: audio.track != null,
    deviceName: micName,
  };
  const camSource = {
    kind: "camera" as const,
    enabled: userChoices.videoEnabled,
    isPending: video.isPending,
    failure: video.failure,
    hasTrack: video.track != null,
    deviceName: camName,
  };
  const micStatus = useMediaStatus(micSource);
  const camStatus = useMediaStatus(camSource);
  const isBlocked = audio.failure === "denied" || video.failure === "denied";
  const showsVideo = userChoices.videoEnabled && video.track != null;

  function submit(event: FormEvent) {
    event.preventDefault();
    const displayName = username.trim();
    if (!displayName) {
      setNameError(true);
      return;
    }
    onJoin({
      displayName,
      passcode,
      // Only what actually worked here goes into the room: joining "with the
      // mic on" when no mic could be opened is how people end up on a call
      // with a live icon and no sound.
      audioEnabled: userChoices.audioEnabled && audio.failure == null,
      videoEnabled: userChoices.videoEnabled && video.failure == null,
      audioDeviceId,
      videoDeviceId,
    });
  }

  return (
    <main className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-8 *:min-w-0 md:min-h-svh md:grid-cols-[3fr_2fr] md:items-center md:gap-12">
      {/* Preview */}
      <section className="space-y-3">
        <div className="relative aspect-video overflow-hidden rounded-2xl bg-neutral-900 shadow-[var(--shadow-xl)] ring-1 ring-black/10">
          <video
            ref={videoRef}
            className={cn(
              "size-full object-cover -scale-x-100 transition-opacity duration-300",
              showsVideo ? "opacity-100" : "opacity-0",
            )}
            muted
            playsInline
            autoPlay
          />
          {!showsVideo && (
            <div className="absolute inset-0 grid place-items-center text-neutral-400">
              <div className="flex flex-col items-center gap-2">
                <VideoOffIcon className="size-8" />
                <span className="text-sm">
                  {userChoices.videoEnabled && video.failure
                    ? camStatus.text
                    : t("meetings.prejoin.cameraOff")}
                </span>
              </div>
            </div>
          )}

          {/* Everything the browser knows about the devices, one tap away. */}
          <div className="dark absolute top-3 end-3 text-white">
            <MediaCheckDialog
              microphone={{
                ...micSource,
                track: audio.track,
                onRetry: audio.retry,
              }}
              camera={{ ...camSource, onRetry: video.retry }}
              audioInput={{
                deviceId: audioDeviceId,
                onChange: saveAudioInputDeviceId,
              }}
              videoInput={{
                deviceId: videoDeviceId,
                onChange: saveVideoInputDeviceId,
              }}
            />
          </div>

          {/* Live mic level, so "can they hear me?" is answered before joining. */}
          {userChoices.audioEnabled && audio.track && (
            <div className="absolute bottom-4 start-4 rounded-full bg-black/40 px-3 py-1.5 text-white backdrop-blur">
              <MicLevelMeter track={audio.track} />
            </div>
          )}

          <div className="absolute inset-x-0 bottom-4 flex justify-center gap-3">
            <ToggleButton
              // The button says what is *true*: wanted-and-working is on,
              // wanted-but-failed shows a warning badge, not a green mic.
              active={userChoices.audioEnabled && audio.failure == null}
              warning={
                userChoices.audioEnabled &&
                (audio.failure != null ||
                  audioHealth.status === "silent" ||
                  audioHealth.status === "hardwareMuted")
              }
              onClick={() => saveAudioInputEnabled(!userChoices.audioEnabled)}
              label={t("meetings.prejoin.microphone")}
              onIcon={<MicIcon />}
              offIcon={<MicOffIcon />}
            />
            <ToggleButton
              active={userChoices.videoEnabled && video.failure == null}
              warning={userChoices.videoEnabled && video.failure != null}
              onClick={() => saveVideoInputEnabled(!userChoices.videoEnabled)}
              label={t("meetings.prejoin.camera")}
              onIcon={<VideoIcon />}
              offIcon={<VideoOffIcon />}
            />
          </div>
        </div>

        <div className="grid gap-3 *:min-w-0 sm:grid-cols-2">
          <div className="space-y-1.5">
            <DeviceSelect
              kind="audioinput"
              value={audioDeviceId}
              onChange={saveAudioInputDeviceId}
              ariaLabel={t("meetings.prejoin.microphone")}
              emptyLabel={t("meetings.prejoin.noMicrophone")}
            />
            <div className="flex items-start justify-between gap-2">
              <MediaStatusLine status={micStatus} isPending={audio.isPending} />
              {audio.failure && (
                <Button
                  type="button"
                  variant="link"
                  size="xs"
                  className="h-auto px-0"
                  onClick={audio.retry}
                >
                  {t("meetings.media.retry")}
                </Button>
              )}
            </div>
          </div>
          <div className="space-y-1.5">
            <DeviceSelect
              kind="videoinput"
              value={videoDeviceId}
              onChange={saveVideoInputDeviceId}
              ariaLabel={t("meetings.prejoin.camera")}
              emptyLabel={t("meetings.prejoin.noCamera")}
            />
            <div className="flex items-start justify-between gap-2">
              <MediaStatusLine status={camStatus} isPending={video.isPending} />
              {video.failure && (
                <Button
                  type="button"
                  variant="link"
                  size="xs"
                  className="h-auto px-0"
                  onClick={video.retry}
                >
                  {t("meetings.media.retry")}
                </Button>
              )}
            </div>
          </div>
        </div>

        {isBlocked && (
          <Alert variant="destructive">
            <AlertTriangleIcon />
            <AlertDescription>
              <PermissionHint />
            </AlertDescription>
          </Alert>
        )}
        {!isBlocked && micStatus.showSystemHint && (
          <Alert variant="warning">
            <AlertTriangleIcon />
            <AlertDescription>
              {t("meetings.media.hint.system")}
            </AlertDescription>
          </Alert>
        )}
      </section>

      {/* Join form */}
      <form onSubmit={submit} className="space-y-6">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">{title}</p>
          <h1 className="font-display text-2xl leading-tight text-balance sm:text-3xl">
            {meeting.title}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("meetings.prejoin.hostedBy", { name: meeting.hostName })}
            {meeting.status === "scheduled" && meeting.scheduledAt && (
              <>
                {" · "}
                {t("meetings.detail.startsAt", { when: meeting.scheduledAt })}
              </>
            )}
          </p>
          <MeetingLinkRow code={meeting.code} />
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="display-name">
              {t("meetings.prejoin.yourName")}
            </Label>
            <Input
              id="display-name"
              value={username}
              onChange={(event) => {
                // Cleared → back to the saved/account name, as before.
                setNameOverride(event.target.value || null);
                saveUsername(event.target.value);
                setNameError(false);
              }}
              placeholder={t("meetings.prejoin.namePlaceholder")}
              aria-invalid={nameError || undefined}
              autoComplete="name"
              maxLength={64}
              className="h-10"
            />
            {nameError && (
              <p className="text-xs text-destructive">
                {t("meetings.validation.nameRequired")}
              </p>
            )}
          </div>

          {meeting.requiresPasscode && !hasInvite && (
            <div className="space-y-1.5">
              <Label htmlFor="passcode">{t("meetings.prejoin.passcode")}</Label>
              <Input
                id="passcode"
                value={passcode}
                onChange={(event) => setPasscode(event.target.value)}
                autoComplete="off"
                inputMode="text"
                maxLength={16}
                className="h-10 font-mono tracking-widest"
              />
            </div>
          )}
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-col gap-3">
          <Button
            type="submit"
            size="lg"
            className="h-11 text-sm"
            disabled={isJoining}
          >
            {isJoining
              ? t("meetings.prejoin.joining")
              : t("meetings.prejoin.joinNow")}
          </Button>
          <Link
            href="/"
            className="text-center text-xs text-muted-foreground underline-offset-4 hover:underline"
          >
            {t("meetings.prejoin.backHome")}
          </Link>
        </div>
      </form>
    </main>
  );
}

function ToggleButton({
  active,
  warning = false,
  onClick,
  label,
  onIcon,
  offIcon,
}: {
  active: boolean;
  /** Wanted on, but the device isn't delivering — badge it. */
  warning?: boolean;
  onClick: () => void;
  label: string;
  onIcon: React.ReactNode;
  offIcon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      className={cn(
        "relative grid size-12 place-items-center rounded-full border backdrop-blur transition-[color,background-color,border-color,transform] duration-150 ease-standard active:scale-95 [&>svg]:size-5",
        active
          ? "border-white/15 bg-white/10 text-white hover:bg-white/20"
          : "border-transparent bg-destructive text-white hover:bg-destructive/90",
      )}
    >
      {active ? onIcon : offIcon}
      {warning && (
        <span className="absolute -top-0.5 -end-0.5 grid size-4 place-items-center rounded-full bg-warning text-warning-foreground ring-2 ring-neutral-900">
          <AlertTriangleIcon className="size-2.5" />
        </span>
      )}
    </button>
  );
}

/**
 * The meeting link, right where people wait to go in — so a host (or a guest
 * pulling someone else in) can send it without leaving the lobby.
 */
function MeetingLinkRow({ code }: { code: string }) {
  const { t } = useTranslation();
  const canShare = useCanShare();
  const path = `/m/${code}`;
  const url = () => `${window.location.origin}${path}`;

  async function copyLink() {
    await navigator.clipboard.writeText(url());
    toast.success(t("meetings.prejoin.linkCopied"));
  }

  async function share() {
    const result = await shareLink({
      title: t("appName"),
      text: t("meetings.prejoin.shareText"),
      url: url(),
    });
    if (result === "unsupported") await copyLink();
  }

  return (
    <div className="flex flex-wrap items-center gap-2 pt-2">
      <span
        className="inline-flex min-w-0 max-w-full items-center rounded-full border border-border bg-muted px-3 py-1 font-mono text-xs text-muted-foreground"
        title={t("meetings.prejoin.link")}
      >
        <span className="truncate" dir="ltr">
          {path}
        </span>
      </span>
      <Button type="button" variant="outline" size="sm" onClick={copyLink}>
        <CopyIcon data-icon="inline-start" />
        {t("meetings.prejoin.copyLink")}
      </Button>
      {canShare && (
        <Button type="button" variant="outline" size="sm" onClick={share}>
          <Share2Icon data-icon="inline-start" />
          {t("meetings.prejoin.share")}
        </Button>
      )}
    </div>
  );
}
