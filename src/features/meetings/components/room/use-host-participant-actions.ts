"use client";

import { useRoomContext } from "@livekit/components-react";
import { useMutation } from "@tanstack/react-query";
import { type Participant, ParticipantEvent, Track } from "livekit-client";
import { useCallback, useEffect, useRef, useState } from "react";

import { useTranslation } from "@/features/core/i18n/client";
import type { HostActionErrorCode } from "@/features/meetings/server/host-actions";
import { useTRPC } from "@/integrations/trpc/client";
import { isolate } from "./bidi";
import {
  ASK_THROTTLE_MS,
  ERROR_CLEAR_MS,
  encodeMessage,
  HOST_REQUEST_TOPIC,
  type HostRequestKind,
  PENDING_TIMEOUT_MS,
  PROTOCOL_VERSION,
} from "./protocol";
import { useCurrentRoom } from "./use-current-room";

export type HostAction = "mic" | "camera" | "hand" | "remove";
export type HostAsk = "unmute" | "camera";

type ErrorShape = {
  data?: { hostAction?: HostActionErrorCode | null; code?: string } | null;
};

/** A refused host action's translated message, by its stable code. */
function useHostErrorMessage() {
  const { t } = useTranslation();
  return useCallback(
    (error: unknown, name: string) => {
      const data = (error as ErrorShape | null)?.data;
      const code =
        data?.hostAction ?? (data?.code === "FORBIDDEN" ? "NOT_HOST" : null);
      switch (code) {
        case "PARTICIPANT_NOT_FOUND":
          return t("meetings.host.errors.participantNotFound", { name });
        case "SELF_TARGET":
          return t("meetings.host.errors.selfTarget");
        case "FOREIGN_ROOM":
          return t("meetings.host.errors.foreignRoom");
        case "NOT_HOST":
          return t("meetings.host.errors.notHost");
        default:
          return t("meetings.host.errors.generic");
      }
    },
    [t],
  );
}

/** Sends a `host-request` message; to one person, or to the room when `to` is null. */
export function useSendHostRequest() {
  const room = useRoomContext();
  return useCallback(
    (kind: HostRequestKind, to: string | null) =>
      room.localParticipant
        .publishData(encodeMessage({ v: PROTOCOL_VERSION, kind }), {
          reliable: true,
          topic: HOST_REQUEST_TOPIC,
          ...(to ? { destinationIdentities: [to] } : {}),
        })
        .catch(() => {
          // The notice is a courtesy; the action itself already happened.
        }),
    [room],
  );
}

type ActionError = { message: string; retry: () => void };

/**
 * Everything the host can do to one participant, shared by the floating
 * window's tile strip and the Participants panel so both behave the same.
 *
 * A mute stays "pending" until the participant's own `TrackMuted` arrives
 * (or the server says there was nothing on, or 5s pass), so the icon never
 * flickers back to "on" in between. Asks are throttled per kind for 10s,
 * shown as "Asked". Errors stay inline, per participant, for 6s — toasts
 * render in the meeting tab, invisible while the host looks at the
 * floating window.
 */
export function useHostParticipantActions(
  code: string,
  participant: Participant,
) {
  const trpc = useTRPC();
  const { name: roomName } = useCurrentRoom();
  const send = useSendHostRequest();
  const errorMessage = useHostErrorMessage();
  const identity = participant.identity;
  const displayName = isolate(participant.name || identity);

  const [pending, setPending] = useState<ReadonlySet<HostAction>>(new Set());
  const [asked, setAsked] = useState<ReadonlySet<HostAsk>>(new Set());
  const [error, setError] = useState<ActionError | null>(null);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  const later = useCallback((fn: () => void, ms: number) => {
    const id = setTimeout(() => {
      timers.current.delete(id);
      fn();
    }, ms);
    timers.current.add(id);
  }, []);
  useEffect(() => {
    const all = timers.current;
    return () => {
      for (const id of all) clearTimeout(id);
    };
  }, []);

  const setFlag = useCallback((action: HostAction, on: boolean) => {
    setPending((current) => {
      const next = new Set(current);
      if (on) next.add(action);
      else next.delete(action);
      return next;
    });
  }, []);

  // Clear a mute's pending state as soon as the SFU confirms it.
  useEffect(() => {
    const onMuted = (publication: { source: Track.Source }) => {
      if (publication.source === Track.Source.Microphone) setFlag("mic", false);
      if (publication.source === Track.Source.Camera) setFlag("camera", false);
    };
    participant.on(ParticipantEvent.TrackMuted, onMuted);
    return () => {
      participant.off(ParticipantEvent.TrackMuted, onMuted);
    };
  }, [participant, setFlag]);

  const fail = useCallback(
    (cause: unknown, retry: () => void) => {
      setError({ message: errorMessage(cause, displayName), retry });
      later(
        () =>
          setError((current) => (current?.retry === retry ? null : current)),
        ERROR_CLEAR_MS,
      );
    },
    [errorMessage, displayName, later],
  );

  const muteMicrophone = useMutation(
    trpc.host.muteMicrophone.mutationOptions(),
  );
  const muteCamera = useMutation(trpc.host.muteCamera.mutationOptions());
  const lowerHandMutation = useMutation(trpc.host.lowerHand.mutationOptions());
  const removeMutation = useMutation(
    trpc.host.removeParticipant.mutationOptions(),
  );

  const input = { code, identity, roomName };

  function run(
    action: HostAction,
    call: () => Promise<{ changed?: boolean } | unknown>,
    notice: HostRequestKind | null,
    holdUntilMuted: boolean,
  ) {
    const retry = () => run(action, call, notice, holdUntilMuted);
    setError(null);
    setFlag(action, true);
    call()
      .then((result) => {
        const changed = (result as { changed?: boolean } | null)?.changed;
        if (notice && changed !== false) void send(notice, identity);
        if (holdUntilMuted && changed !== false) {
          later(() => setFlag(action, false), PENDING_TIMEOUT_MS);
        } else {
          setFlag(action, false);
        }
      })
      .catch((cause: unknown) => {
        setFlag(action, false);
        fail(cause, retry);
      });
  }

  function ask(kind: HostAsk) {
    if (asked.has(kind)) return;
    setError(null);
    void send(kind === "unmute" ? "ask-unmute" : "ask-camera", identity);
    setAsked((current) => new Set(current).add(kind));
    later(() => {
      setAsked((current) => {
        const next = new Set(current);
        next.delete(kind);
        return next;
      });
    }, ASK_THROTTLE_MS);
  }

  return {
    pending,
    asked,
    error,
    dismissError: () => setError(null),
    muteMicrophone: () =>
      run("mic", () => muteMicrophone.mutateAsync(input), "notice-muted", true),
    muteCamera: () =>
      run(
        "camera",
        () => muteCamera.mutateAsync(input),
        "notice-camera-off",
        true,
      ),
    lowerHand: () =>
      run(
        "hand",
        () => lowerHandMutation.mutateAsync(input),
        "notice-hand-lowered",
        false,
      ),
    remove: () =>
      run("remove", () => removeMutation.mutateAsync(input), null, false),
    askToUnmute: () => ask("unmute"),
    askToTurnOnCamera: () => ask("camera"),
  };
}

export type HostParticipantActions = ReturnType<
  typeof useHostParticipantActions
>;

/**
 * "Mute everyone" in the host's current room. Reports partial results
 * ("Muted 3 of 4") instead of a bare success, and tells the room.
 */
export function useHostMuteAll(code: string) {
  const trpc = useTRPC();
  const { t } = useTranslation();
  const { name: roomName } = useCurrentRoom();
  const send = useSendHostRequest();
  const errorMessage = useHostErrorMessage();
  const [status, setStatus] = useState<string | null>(null);
  const mutation = useMutation(
    trpc.host.muteAll.mutationOptions({
      onMutate: () => setStatus(null),
      onSuccess: ({ muted, failed }) => {
        void send("notice-muted-all", null);
        if (failed > 0) {
          setStatus(
            t("meetings.host.mutedPartial", { muted, total: muted + failed }),
          );
        }
      },
      onError: (error) => setStatus(errorMessage(error, "")),
    }),
  );

  useEffect(() => {
    if (!status) return;
    const id = setTimeout(() => setStatus(null), ERROR_CLEAR_MS);
    return () => clearTimeout(id);
  }, [status]);

  return {
    muteAll: () => mutation.mutate({ code, roomName }),
    isPending: mutation.isPending,
    status,
  };
}
