"use client";

import {
  useDataChannel,
  useLocalParticipant,
  useRoomContext,
  useTracks,
} from "@livekit/components-react";
import {
  type Participant,
  RoomEvent,
  Track,
  type TrackPublication,
} from "livekit-client";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { toast } from "sonner";

import { useTranslation } from "@/features/core/i18n/client";
import { meetingFlags } from "@/features/meetings/lib/meeting-flags";
import { useHostIdentity } from "../host-identity";
import {
  ANNOTATION_TOPIC,
  type Annotation,
  decodeAnnotation,
  encodeMessage,
  LASER_FADE_MS,
  LOSSY_KINDS,
  MESSAGE_MAX_BYTES,
  POINTS_MESSAGE_MAX_BYTES,
  PROTOCOL_VERSION,
} from "../protocol";
import { useCurrentRoom } from "../use-current-room";
import { AnnotationStore, type DropReason } from "./store";

/** Messages as the local user sends them, before the envelope is added. */
export type OutgoingAnnotation = Annotation extends infer M
  ? M extends Annotation
    ? Omit<M, "v">
    : never
  : never;

type AnnotationsContextValue = {
  store: AnnotationStore;
  localIdentity: string;
  hostIdentity: string | null;
  isHost: boolean;
  /** Whether the local user may draw right now (host, or the room allows it). */
  canDraw: boolean;
  /** Sends and echoes locally. Returns false when the message was too big to send. */
  send: (message: OutgoingAnnotation) => boolean;
};

const AnnotationsContext = createContext<AnnotationsContextValue | null>(null);

/** Dev-only: one `console.debug` per reason per sender per 5 seconds. */
function useDropLogger() {
  const lastRef = useRef(new Map<string, number>());
  return useCallback((reason: DropReason | string, sender: string) => {
    if (process.env.NODE_ENV === "production") return;
    const key = `${reason}:${sender}`;
    const now = Date.now();
    if (now - (lastRef.current.get(key) ?? 0) < 5_000) return;
    lastRef.current.set(key, now);
    console.debug(`[annotations] dropped (${reason}) from ${sender}`);
  }, []);
}

/**
 * Owns the room's annotation store: which shares exist, what arrives on
 * the `annotation` topic, pauses, and the host's live on/off switch.
 * Rendered once in the room; the overlay, toolbar and sharer banner read
 * from it. With the kill switch off it renders only its children.
 */
export function AnnotationsProvider({ children }: { children: ReactNode }) {
  if (!meetingFlags.annotations) return children;
  return <AnnotationsRoot>{children}</AnnotationsRoot>;
}

function AnnotationsRoot({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const room = useRoomContext();
  const { localParticipant } = useLocalParticipant();
  const hostIdentity = useHostIdentity();
  const { allowAnnotations } = useCurrentRoom();
  const [store] = useState(() => new AnnotationStore());
  const logDrop = useDropLogger();
  const localIdentity = localParticipant.identity;
  const isHost = hostIdentity != null && localIdentity === hostIdentity;
  const canDraw = isHost || allowAnnotations;

  // Only published shares accept ink; an unpublished share's ink is purged.
  const shares = useTracks(
    [{ source: Track.Source.ScreenShare, withPlaceholder: false }],
    { onlySubscribed: false },
  );
  const shareSids = shares
    .map((track) => track.publication?.trackSid)
    .filter((sid): sid is string => sid != null)
    .sort()
    .join(",");
  useEffect(() => {
    store.setPublishedShares(shareSids ? shareSids.split(",") : []);
  }, [store, shareSids]);

  // A paused share (muted publication) loses its ink on every client.
  useEffect(() => {
    const onMuted = (publication: TrackPublication) => {
      if (publication.source === Track.Source.ScreenShare) {
        store.clearForPause(publication.trackSid);
      }
    };
    room.on(RoomEvent.TrackMuted, onMuted);
    room.on(RoomEvent.LocalTrackUnpublished, onMuted);
    return () => {
      room.off(RoomEvent.TrackMuted, onMuted);
      room.off(RoomEvent.LocalTrackUnpublished, onMuted);
    };
  }, [room, store]);

  // Faded laser pointers leave the store even when nothing is animating
  // them (a hidden tab), so the sharer's "annotating" count stays true.
  useEffect(() => {
    const id = setInterval(
      () => store.expireLasers(performance.now()),
      LASER_FADE_MS / 3,
    );
    return () => clearInterval(id);
  }, [store]);

  // The host turned annotations off: non-host ink goes, and people are told.
  const wasAllowedRef = useRef(allowAnnotations);
  useEffect(() => {
    if (wasAllowedRef.current && !allowAnnotations) {
      store.removeNonHost(hostIdentity);
      if (!isHost) toast(t("meetings.hostRequest.noticeAnnotationsOff"));
    }
    wasAllowedRef.current = allowAnnotations;
  }, [allowAnnotations, hostIdentity, isHost, store, t]);

  const settingsRef = useRef({ hostIdentity, allowAnnotations });
  settingsRef.current = { hostIdentity, allowAnnotations };

  const { send: publish } = useDataChannel(ANNOTATION_TOPIC, (message) => {
    const sender = message.from?.identity;
    if (!sender) return;
    const decoded = decodeAnnotation(message.payload);
    if (!decoded.ok) {
      logDrop(decoded.reason, sender);
      return;
    }
    const dropped = store.apply(decoded.value, {
      sender,
      senderName: (message.from as Participant).name || sender,
      now: performance.now(),
      ...settingsRef.current,
    });
    if (dropped) logDrop(dropped, sender);
  });

  const send = useCallback(
    (message: OutgoingAnnotation) => {
      const envelope = { v: PROTOCOL_VERSION, ...message } as Annotation;
      const payload = encodeMessage(envelope);
      const isLossy = LOSSY_KINDS.has(envelope.kind);
      const cap = isLossy ? POINTS_MESSAGE_MAX_BYTES : MESSAGE_MAX_BYTES;
      if (payload.byteLength > cap) return false;
      // The data channel does not echo: apply our own ink locally.
      store.apply(envelope, {
        sender: localParticipant.identity,
        senderName: localParticipant.name || localParticipant.identity,
        now: performance.now(),
        isLocal: true,
        ...settingsRef.current,
      });
      void publish(payload, { reliable: !isLossy }).catch(() => {
        // Lossy by design; reliable kinds are retried by the transport.
      });
      return true;
    },
    [localParticipant, publish, store],
  );

  const value = useMemo(
    () => ({ store, localIdentity, hostIdentity, isHost, canDraw, send }),
    [store, localIdentity, hostIdentity, isHost, canDraw, send],
  );

  return (
    <AnnotationsContext.Provider value={value}>
      {children}
    </AnnotationsContext.Provider>
  );
}

/** Null when annotations are switched off by the kill switch. */
export function useAnnotations() {
  return useContext(AnnotationsContext);
}

/**
 * Subscribes to store changes, re-rendering at most once per animation
 * frame however many messages arrive in between. While the meeting tab is
 * hidden (the presenter looking at what they share) it gets no animation
 * frames, but the floating window still renders from this store — so
 * batching falls back to a microtask then.
 */
export function useAnnotationVersion(store: AnnotationStore | undefined) {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!store) return () => {};
      let frame = 0;
      let queued = false;
      let active = true;
      const unsubscribe = store.subscribe(() => {
        if (frame || queued) return;
        if (document.visibilityState === "hidden") {
          queued = true;
          queueMicrotask(() => {
            queued = false;
            if (active) onChange();
          });
          return;
        }
        frame = requestAnimationFrame(() => {
          frame = 0;
          onChange();
        });
      });
      // A frame requested just before the tab hid would never fire.
      const onVisibility = () => {
        if (document.visibilityState !== "hidden" || !frame) return;
        cancelAnimationFrame(frame);
        frame = 0;
        onChange();
      };
      document.addEventListener("visibilitychange", onVisibility);
      return () => {
        active = false;
        unsubscribe();
        document.removeEventListener("visibilitychange", onVisibility);
        if (frame) cancelAnimationFrame(frame);
      };
    },
    [store],
  );
  return useSyncExternalStore(
    subscribe,
    () => store?.getVersion() ?? 0,
    () => 0,
  );
}
