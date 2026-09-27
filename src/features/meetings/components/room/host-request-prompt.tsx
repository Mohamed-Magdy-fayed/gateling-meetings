"use client";

import { useDataChannel, useLocalParticipant } from "@livekit/components-react";
import { HandIcon, MicIcon, VideoIcon } from "lucide-react";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useTranslation } from "@/features/core/i18n/client";
import { useHostIdentity } from "./host-identity";
import {
  decodeHostRequest,
  HOST_REQUEST_TOPIC,
  isFromHost,
  PROMPT_DISMISS_MS,
  RESIDUAL_BADGE_MS,
} from "./protocol";

type AskKind = "mic" | "camera";

type HostAskState = {
  /** Asks currently shown as a card. */
  prompts: ReadonlySet<AskKind>;
  /** Asks that timed out unanswered: a hand badge on that control-bar button. */
  badges: ReadonlySet<AskKind>;
  accept: (kind: AskKind) => void;
  dismiss: (kind: AskKind) => void;
};

const HostAskContext = createContext<HostAskState | null>(null);

function without<T>(set: ReadonlySet<T>, value: T): ReadonlySet<T> {
  if (!set.has(value)) return set;
  const next = new Set(set);
  next.delete(value);
  return next;
}

/**
 * Listens for `host-request` messages (see protocol.ts) and turns them into
 * what the moderated person sees: a toast for things the host already did,
 * a non-modal card for things the host is asking. Only messages whose
 * SFU-reported sender is the server-reported host are honoured.
 */
export function HostRequestProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const hostIdentity = useHostIdentity();
  const { localParticipant } = useLocalParticipant();
  const [prompts, setPrompts] = useState<ReadonlySet<AskKind>>(new Set());
  const [badges, setBadges] = useState<ReadonlySet<AskKind>>(new Set());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const schedule = useCallback((key: string, fn: () => void, ms: number) => {
    const existing = timers.current.get(key);
    if (existing) clearTimeout(existing);
    timers.current.set(
      key,
      setTimeout(() => {
        timers.current.delete(key);
        fn();
      }, ms),
    );
  }, []);
  const cancel = useCallback((key: string) => {
    const existing = timers.current.get(key);
    if (existing) clearTimeout(existing);
    timers.current.delete(key);
  }, []);
  useEffect(() => {
    const all = timers.current;
    return () => {
      for (const id of all.values()) clearTimeout(id);
    };
  }, []);

  const clear = useCallback(
    (kind: AskKind) => {
      cancel(`prompt:${kind}`);
      cancel(`badge:${kind}`);
      setPrompts((current) => without(current, kind));
      setBadges((current) => without(current, kind));
    },
    [cancel],
  );

  const showAsk = useCallback(
    (kind: AskKind) => {
      // A repeat replaces the card (and restarts its timer).
      setBadges((current) => without(current, kind));
      cancel(`badge:${kind}`);
      setPrompts((current) => new Set(current).add(kind));
      schedule(
        `prompt:${kind}`,
        () => {
          setPrompts((current) => without(current, kind));
          setBadges((current) => new Set(current).add(kind));
          schedule(
            `badge:${kind}`,
            () => setBadges((current) => without(current, kind)),
            RESIDUAL_BADGE_MS,
          );
        },
        PROMPT_DISMISS_MS,
      );
    },
    [cancel, schedule],
  );

  useDataChannel(HOST_REQUEST_TOPIC, (message) => {
    if (!isFromHost(message.from?.identity, hostIdentity)) return;
    const decoded = decodeHostRequest(message.payload);
    if (!decoded.ok) return;
    switch (decoded.value.kind) {
      case "ask-unmute":
        showAsk("mic");
        break;
      case "ask-camera":
        showAsk("camera");
        break;
      case "notice-muted":
        clear("mic");
        toast(t("meetings.hostRequest.noticeMuted"));
        break;
      case "notice-muted-all":
        clear("mic");
        toast(t("meetings.hostRequest.noticeMutedAll"));
        break;
      case "notice-camera-off":
        clear("camera");
        // The SFU stopped forwarding it; release the device too so the
        // camera light goes off.
        void localParticipant.setCameraEnabled(false).catch(() => {});
        toast(t("meetings.hostRequest.noticeCameraOff"));
        break;
      case "notice-hand-lowered":
        toast(t("meetings.hostRequest.noticeHandLowered"));
        break;
    }
  });

  const accept = useCallback(
    (kind: AskKind) => {
      clear(kind);
      // A refusal (permission denied, device busy) surfaces through the
      // room's existing MediaDevicesError toast.
      const turnOn =
        kind === "mic"
          ? localParticipant.setMicrophoneEnabled(true)
          : localParticipant.setCameraEnabled(true);
      void turnOn.catch(() => {});
    },
    [clear, localParticipant],
  );

  // Turning the device on by any means answers the ask.
  useEffect(() => {
    if (localParticipant.isMicrophoneEnabled) clear("mic");
    if (localParticipant.isCameraEnabled) clear("camera");
  });

  return (
    <HostAskContext.Provider
      value={{ prompts, badges, accept, dismiss: clear }}
    >
      {children}
    </HostAskContext.Provider>
  );
}

/** Whether the control-bar button for `kind` should carry the "host asked" badge. */
export function useHostAskBadge(kind: AskKind): boolean {
  return useContext(HostAskContext)?.badges.has(kind) ?? false;
}

/**
 * The ask cards, anchored above the control bar. Non-modal: announced
 * assertively but never takes focus from what the person was doing.
 */
export function HostRequestPrompt() {
  const { t } = useTranslation();
  const state = useContext(HostAskContext);
  if (!state || state.prompts.size === 0) return null;

  return (
    <div
      aria-live="assertive"
      className="pointer-events-none absolute inset-x-3 bottom-3 z-30 flex flex-col items-center gap-2"
    >
      {[...state.prompts].map((kind) => (
        <Card
          key={kind}
          size="sm"
          className="dark pointer-events-auto w-full max-w-sm motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2"
        >
          <CardContent className="flex flex-wrap items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-warning/15 text-warning">
              <HandIcon className="size-4" aria-hidden />
            </span>
            <p className="min-w-0 flex-1 text-sm text-pretty">
              {kind === "mic"
                ? t("meetings.hostRequest.askUnmute")
                : t("meetings.hostRequest.askCamera")}
            </p>
            <span className="flex gap-2">
              <Button
                size="sm"
                className="min-h-11 sm:min-h-8"
                onClick={() => state.accept(kind)}
              >
                {kind === "mic" ? (
                  <MicIcon data-icon="inline-start" />
                ) : (
                  <VideoIcon data-icon="inline-start" />
                )}
                {kind === "mic"
                  ? t("meetings.hostRequest.unmute")
                  : t("meetings.hostRequest.turnOnCamera")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="min-h-11 sm:min-h-8"
                onClick={() => state.dismiss(kind)}
              >
                {t("meetings.hostRequest.notNow")}
              </Button>
            </span>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
