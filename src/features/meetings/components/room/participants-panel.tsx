"use client";

import {
  useIsSpeaking,
  useParticipantAttribute,
  useParticipants,
  useTrackMutedIndicator,
} from "@livekit/components-react";
import { useMutation } from "@tanstack/react-query";
import type { Participant } from "livekit-client";
import { Track } from "livekit-client";
import {
  HandIcon,
  MicIcon,
  MicOffIcon,
  MoreHorizontalIcon,
  UserXIcon,
  VideoIcon,
  VideoOffIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTranslation } from "@/features/core/i18n/client";
import { PARTICIPANT_ATTRIBUTE_ROLE } from "@/integrations/livekit/attributes";
import { useTRPC } from "@/integrations/trpc/client";
import { cn } from "@/lib/utils";
import { useHandRaised } from "./use-hand-raise";
import { WaitingQueue, type WaitingQueueState } from "./waiting-queue";

type ParticipantsPanelProps = {
  code: string;
  isHost: boolean;
  waitingQueue: WaitingQueueState;
};

export function ParticipantsPanel({
  code,
  isHost,
  waitingQueue,
}: ParticipantsPanelProps) {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const participants = useParticipants();
  const muteAll = useMutation(
    trpc.host.muteAll.mutationOptions({
      onError: (error) => toast.error(error.message),
    }),
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {isHost && <WaitingQueue {...waitingQueue} />}
      <ul className="min-h-0 flex-1 overflow-y-auto p-2">
        {participants.map((participant) => (
          <ParticipantRow
            key={participant.sid}
            participant={participant}
            code={code}
            isHost={isHost}
          />
        ))}
      </ul>
      {isHost && participants.length > 1 && (
        <div className="border-t border-white/10 p-2">
          <Button
            variant="secondary"
            size="sm"
            className="w-full"
            disabled={muteAll.isPending}
            onClick={() => muteAll.mutate({ code })}
          >
            <MicOffIcon data-icon="inline-start" />
            {t("meetings.host.muteAll")}
          </Button>
        </div>
      )}
    </div>
  );
}

type ParticipantRowProps = {
  participant: Participant;
  code: string;
  isHost: boolean;
};

function ParticipantRow({ participant, code, isHost }: ParticipantRowProps) {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const isSpeaking = useIsSpeaking(participant);
  const isHandRaised = useHandRaised(participant);
  const role = useParticipantAttribute(PARTICIPANT_ATTRIBUTE_ROLE, {
    participant,
  });
  const { isMuted: isMicMuted } = useTrackMutedIndicator({
    participant,
    source: Track.Source.Microphone,
  });
  const { isMuted: isCameraMuted } = useTrackMutedIndicator({
    participant,
    source: Track.Source.Camera,
  });

  const onError = (error: { message: string }) => toast.error(error.message);
  const mute = useMutation(
    trpc.host.muteParticipant.mutationOptions({ onError }),
  );
  const lowerHand = useMutation(
    trpc.host.lowerHand.mutationOptions({ onError }),
  );
  const remove = useMutation(
    trpc.host.removeParticipant.mutationOptions({ onError }),
  );

  const name = participant.name || participant.identity;
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  const identity = participant.identity;
  const canAct = isHost && !participant.isLocal;

  return (
    <li className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-white/5">
      <span
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-full bg-primary/15 text-sm font-semibold text-primary ring-2 ring-transparent transition-shadow",
          isSpeaking && "ring-primary",
        )}
      >
        {initial}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 truncate text-sm">
          {name}
          {participant.isLocal && (
            <span className="text-muted-foreground">
              ({t("meetings.room.you")})
            </span>
          )}
          {isHandRaised && (
            <HandIcon className="size-4 shrink-0 text-warning" />
          )}
        </span>
        {role === "host" && (
          <span className="block text-[0.6875rem] uppercase tracking-wide text-primary">
            {t("meetings.room.host")}
          </span>
        )}
      </span>
      <span className="flex shrink-0 items-center gap-2 text-muted-foreground [&_svg]:size-4">
        {isMicMuted ? <MicOffIcon className="text-destructive" /> : <MicIcon />}
        {isCameraMuted ? <VideoOffIcon /> : <VideoIcon />}
      </span>
      {canAct && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("common.actions")}
              />
            }
          >
            <MoreHorizontalIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="dark w-44">
            <DropdownMenuItem
              disabled={isMicMuted}
              onClick={() => mute.mutate({ code, identity })}
            >
              <MicOffIcon />
              {t("meetings.host.mute")}
            </DropdownMenuItem>
            {isHandRaised && (
              <DropdownMenuItem
                onClick={() => lowerHand.mutate({ code, identity })}
              >
                <HandIcon />
                {t("meetings.host.lowerHand")}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              variant="destructive"
              onClick={() => remove.mutate({ code, identity })}
            >
              <UserXIcon />
              {t("meetings.host.remove")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </li>
  );
}
