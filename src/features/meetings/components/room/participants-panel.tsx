"use client";

import {
  useIsSpeaking,
  useParticipantAttribute,
  useParticipants,
  useTrackMutedIndicator,
} from "@livekit/components-react";
import type { Participant } from "livekit-client";
import { Track } from "livekit-client";
import { MicIcon, MicOffIcon, VideoIcon, VideoOffIcon } from "lucide-react";

import { useTranslation } from "@/features/core/i18n/client";
import { PARTICIPANT_ATTRIBUTE_ROLE } from "@/integrations/livekit/attributes";
import { cn } from "@/lib/utils";

export function ParticipantsPanel() {
  const participants = useParticipants();

  return (
    <ul className="min-h-0 flex-1 overflow-y-auto p-2">
      {participants.map((participant) => (
        <ParticipantRow key={participant.sid} participant={participant} />
      ))}
    </ul>
  );
}

function ParticipantRow({ participant }: { participant: Participant }) {
  const { t } = useTranslation();
  const isSpeaking = useIsSpeaking(participant);
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

  const name = participant.name || participant.identity;
  const initial = name.trim().charAt(0).toUpperCase() || "?";

  return (
    <li className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted/60">
      <span
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-full bg-primary/15 text-sm font-semibold text-primary ring-2 ring-transparent transition-shadow",
          isSpeaking && "ring-primary",
        )}
      >
        {initial}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm">
          {name}
          {participant.isLocal && (
            <span className="text-muted-foreground">
              {" "}
              ({t("meetings.room.you")})
            </span>
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
    </li>
  );
}
