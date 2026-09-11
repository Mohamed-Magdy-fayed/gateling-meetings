"use client";

import "@livekit/components-styles/components/layout";
import "./room/room.css";

import {
  LiveKitRoom,
  RoomAudioRenderer,
  useChat,
  useConnectionState,
  useParticipants,
} from "@livekit/components-react";
import { useMutation } from "@tanstack/react-query";
import {
  ConnectionState,
  DisconnectReason,
  Room,
  VideoPresets,
} from "livekit-client";
import { CopyIcon, XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useTranslation } from "@/features/core/i18n/client";
import { useIsMobile } from "@/hooks/use-mobile";
import { useTRPC } from "@/integrations/trpc/client";
import { cn } from "@/lib/utils";
import type {
  JoinSession,
  LeaveReason,
  MeetingSummary,
} from "./meeting-client";
import type { PreJoinValues } from "./pre-join";
import { ChatPanel } from "./room/chat-panel";
import { ControlBar, type SidePanel } from "./room/control-bar";
import { ParticipantsPanel } from "./room/participants-panel";
import { Stage } from "./room/stage";

type MeetingRoomProps = {
  meeting: MeetingSummary;
  session: JoinSession;
  choices: PreJoinValues;
  onLeave: (reason: LeaveReason, message?: string) => void;
};

function leaveReasonFor(reason: DisconnectReason | undefined): LeaveReason {
  switch (reason) {
    case DisconnectReason.CLIENT_INITIATED:
    case DisconnectReason.DUPLICATE_IDENTITY:
      return "left";
    case DisconnectReason.ROOM_DELETED:
    case DisconnectReason.ROOM_CLOSED:
      return "ended";
    case DisconnectReason.PARTICIPANT_REMOVED:
      return "removed";
    default:
      return "error";
  }
}

/**
 * Owns the `Room` for the lifetime of a join. The room is always rendered on
 * a dark surface — video reads better on it, and it is what every meeting
 * app has trained people to expect — regardless of the site theme.
 */
export function MeetingRoom({
  meeting,
  session,
  choices,
  onLeave,
}: MeetingRoomProps) {
  const [room] = useState(
    () =>
      new Room({
        adaptiveStream: true,
        dynacast: true,
        videoCaptureDefaults: {
          deviceId: choices.videoDeviceId || undefined,
          resolution: VideoPresets.h720.resolution,
        },
        audioCaptureDefaults: {
          deviceId: choices.audioDeviceId || undefined,
          echoCancellation: true,
          noiseSuppression: true,
        },
        publishDefaults: {
          videoSimulcastLayers: [VideoPresets.h180, VideoPresets.h360],
          screenShareSimulcastLayers: [VideoPresets.h720],
        },
      }),
  );

  // Once the host ends the meeting we already know why we disconnected;
  // don't let the SFU's follow-up disconnect event overwrite it.
  const leaveReasonRef = useRef<LeaveReason | null>(null);

  const startWithAudio = choices.audioEnabled && !session.muteOnEntry;

  return (
    <div className="meeting-room dark flex h-svh flex-col bg-neutral-900 text-foreground">
      <LiveKitRoom
        room={room}
        serverUrl={session.serverUrl}
        token={session.token}
        connect
        audio={startWithAudio}
        video={choices.videoEnabled}
        onDisconnected={(reason) =>
          onLeave(leaveReasonRef.current ?? leaveReasonFor(reason))
        }
        onError={(error) => {
          console.error("[livekit]", error);
          toast.error(error.message);
        }}
        className="flex min-h-0 flex-1 flex-col"
      >
        <RoomAudioRenderer />
        <RoomShell
          meeting={meeting}
          session={session}
          onLeave={() => {
            leaveReasonRef.current = "left";
            room.disconnect();
          }}
          onEnded={() => {
            leaveReasonRef.current = "ended";
          }}
        />
      </LiveKitRoom>
    </div>
  );
}

type RoomShellProps = {
  meeting: MeetingSummary;
  session: JoinSession;
  onLeave: () => void;
  onEnded: () => void;
};

function RoomShell({ meeting, session, onLeave, onEnded }: RoomShellProps) {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const isMobile = useIsMobile();
  const connectionState = useConnectionState();
  const participants = useParticipants();
  const chat = useChat();
  const { chatMessages } = chat;

  const [panel, setPanel] = useState<SidePanel>(null);
  const [seenChatCount, setSeenChatCount] = useState(0);
  const unreadChat = panel === "chat" ? 0 : chatMessages.length - seenChatCount;

  // Opening chat marks everything as read; closing remembers where we were.
  useEffect(() => {
    if (panel === "chat") setSeenChatCount(chatMessages.length);
  }, [panel, chatMessages.length]);

  const endMeeting = useMutation(
    trpc.meetings.end.mutationOptions({
      onMutate: onEnded,
      onError: (error) => toast.error(error.message),
    }),
  );

  function togglePanel(next: Exclude<SidePanel, null>) {
    setPanel((current) => (current === next ? null : next));
  }

  async function copyInvite() {
    await navigator.clipboard.writeText(
      `${window.location.origin}/m/${meeting.code}`,
    );
    toast.success(t("meetings.room.inviteCopied"));
  }

  const isHost = session.role === "host";
  const panelTitle =
    panel === "chat"
      ? t("meetings.room.chat")
      : t("meetings.room.participants");
  const panelContent =
    panel === "chat" ? (
      <ChatPanel {...chat} />
    ) : panel === "participants" ? (
      <ParticipantsPanel />
    ) : null;

  return (
    <>
      {/* Top bar */}
      <header className="flex h-12 shrink-0 items-center gap-3 px-3 sm:px-4">
        <h1 className="min-w-0 truncate font-display text-sm sm:text-base">
          {meeting.title}
        </h1>
        <button
          type="button"
          onClick={copyInvite}
          className="hidden items-center gap-1.5 rounded-md bg-white/[0.06] px-2 py-1 font-mono text-xs text-neutral-300 transition-colors hover:bg-white/[0.12] sm:flex"
          title={t("meetings.room.copyInvite")}
        >
          {meeting.code}
          <CopyIcon className="size-3" />
        </button>
        <span className="ms-auto flex items-center gap-2 text-xs text-neutral-400">
          {connectionState === ConnectionState.Reconnecting && (
            <span className="rounded-md bg-warning/20 px-2 py-0.5 text-warning">
              {t("meetings.room.reconnecting")}
            </span>
          )}
          {connectionState === ConnectionState.Connecting && (
            <span>{t("meetings.room.connecting")}</span>
          )}
          <span className="tabular-nums">
            {t("meetings.room.participantCount", {
              count: participants.length,
            })}
          </span>
        </span>
      </header>

      {/* Stage + side panel */}
      <div className="flex min-h-0 flex-1">
        <Stage />
        {!isMobile && panel && (
          <aside className="flex w-80 shrink-0 flex-col border-s border-white/10 bg-neutral-900">
            <div className="flex h-12 items-center justify-between border-b border-white/10 px-3">
              <h2 className="text-sm font-medium">{panelTitle}</h2>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setPanel(null)}
                aria-label={t("common.close")}
              >
                <XIcon />
              </Button>
            </div>
            {panelContent}
          </aside>
        )}
      </div>

      {isMobile && (
        <Sheet
          open={panel != null}
          onOpenChange={(open) => !open && setPanel(null)}
        >
          <SheetContent
            side="bottom"
            className="dark flex h-[70svh] flex-col p-0"
          >
            <SheetHeader className="border-b border-border px-4 py-3">
              <SheetTitle>{panelTitle}</SheetTitle>
            </SheetHeader>
            <div className={cn("flex min-h-0 flex-1 flex-col")}>
              {panelContent}
            </div>
          </SheetContent>
        </Sheet>
      )}

      <ControlBar
        isHost={isHost}
        canShareScreen
        participantCount={participants.length}
        unreadChat={Math.max(0, unreadChat)}
        panel={panel}
        onTogglePanel={togglePanel}
        onLeave={onLeave}
        onEndForAll={() => endMeeting.mutate({ code: meeting.code })}
      />
    </>
  );
}
