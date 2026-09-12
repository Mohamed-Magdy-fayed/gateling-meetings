"use client";

import {
  usePersistentUserChoices,
  usePreviewDevice,
} from "@livekit/components-react";
import type { LocalAudioTrack, LocalVideoTrack } from "livekit-client";
import { MicIcon, MicOffIcon, VideoIcon, VideoOffIcon } from "lucide-react";
import Link from "next/link";
import { type FormEvent, useEffect, useRef, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@/features/core/i18n/client";
import { cn } from "@/lib/utils";
import { DeviceSelect } from "./device-select";
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

  const { localTrack: videoTrack, deviceError: videoError } =
    usePreviewDevice<LocalVideoTrack>(
      userChoices.videoEnabled,
      userChoices.videoDeviceId,
      "videoinput",
    );
  const { deviceError: audioError } = usePreviewDevice<LocalAudioTrack>(
    userChoices.audioEnabled,
    userChoices.audioDeviceId,
    "audioinput",
  );

  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const element = videoRef.current;
    if (!element || !videoTrack) return;
    videoTrack.attach(element);
    return () => {
      videoTrack.detach(element);
    };
  }, [videoTrack]);

  const mediaError = videoError ?? audioError;

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
      audioEnabled: userChoices.audioEnabled,
      videoEnabled: userChoices.videoEnabled,
      audioDeviceId: userChoices.audioDeviceId,
      videoDeviceId: userChoices.videoDeviceId,
    });
  }

  return (
    <main className="mx-auto grid min-h-svh w-full max-w-6xl items-center gap-8 px-4 py-8 md:grid-cols-[3fr_2fr] md:gap-12">
      {/* Preview */}
      <section className="space-y-3">
        <div className="relative aspect-video overflow-hidden rounded-2xl bg-neutral-900 shadow-[var(--shadow-xl)] ring-1 ring-black/10">
          <video
            ref={videoRef}
            className={cn(
              "size-full object-cover -scale-x-100 transition-opacity duration-300",
              userChoices.videoEnabled && videoTrack
                ? "opacity-100"
                : "opacity-0",
            )}
            muted
            playsInline
            autoPlay
          />
          {!(userChoices.videoEnabled && videoTrack) && (
            <div className="absolute inset-0 grid place-items-center text-neutral-400">
              <div className="flex flex-col items-center gap-2">
                <VideoOffIcon className="size-8" />
                <span className="text-sm">
                  {t("meetings.prejoin.cameraOff")}
                </span>
              </div>
            </div>
          )}

          <div className="absolute inset-x-0 bottom-4 flex justify-center gap-3">
            <ToggleButton
              active={userChoices.audioEnabled}
              onClick={() => saveAudioInputEnabled(!userChoices.audioEnabled)}
              label={t("meetings.prejoin.microphone")}
              onIcon={<MicIcon />}
              offIcon={<MicOffIcon />}
            />
            <ToggleButton
              active={userChoices.videoEnabled}
              onClick={() => saveVideoInputEnabled(!userChoices.videoEnabled)}
              label={t("meetings.prejoin.camera")}
              onIcon={<VideoIcon />}
              offIcon={<VideoOffIcon />}
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <DeviceSelect
            kind="audioinput"
            value={userChoices.audioDeviceId}
            onChange={saveAudioInputDeviceId}
            ariaLabel={t("meetings.prejoin.microphone")}
            emptyLabel={t("meetings.prejoin.noMicrophone")}
          />
          <DeviceSelect
            kind="videoinput"
            value={userChoices.videoDeviceId}
            onChange={saveVideoInputDeviceId}
            ariaLabel={t("meetings.prejoin.camera")}
            emptyLabel={t("meetings.prejoin.noCamera")}
          />
        </div>

        {mediaError && (
          <Alert variant="destructive">
            <AlertDescription>
              {t("meetings.errors.mediaDenied")}
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
                setNameOverride(event.target.value);
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
  onClick,
  label,
  onIcon,
  offIcon,
}: {
  active: boolean;
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
        "grid size-12 place-items-center rounded-full border backdrop-blur transition-all ease-spring hover:-translate-y-px active:translate-y-0 [&_svg]:size-5",
        active
          ? "border-white/15 bg-white/10 text-white hover:bg-white/20"
          : "border-transparent bg-destructive text-white hover:bg-destructive/90",
      )}
    >
      {active ? onIcon : offIcon}
    </button>
  );
}
