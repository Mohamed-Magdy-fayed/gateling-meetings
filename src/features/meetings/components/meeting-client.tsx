"use client";

import { useMutation } from "@tanstack/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import { useState } from "react";
import { useTranslation } from "@/features/core/i18n/client";
import { useTRPC } from "@/integrations/trpc/client";
import type { AppRouter } from "@/integrations/trpc/routers/_app";
import { LeftScreen } from "./left-screen";
import { MeetingRoom } from "./meeting-room";
import { PreJoin, type PreJoinValues } from "./pre-join";

type RouterOutputs = inferRouterOutputs<AppRouter>;
export type MeetingSummary = RouterOutputs["meetings"]["getByCode"];
export type JoinSession = Extract<
  RouterOutputs["join"]["request"],
  { status: "admitted" }
>;

export type Viewer = { defaultName: string; isSignedIn: boolean };

export type LeaveReason = "left" | "ended" | "removed" | "error";

type Stage =
  | { kind: "prejoin" }
  | { kind: "room"; session: JoinSession; choices: PreJoinValues }
  | { kind: "left"; reason: LeaveReason; message?: string };

type MeetingClientProps = { meeting: MeetingSummary; viewer: Viewer };

/**
 * The `/m/[code]` page is one client component with three stages —
 * pre-join → room → left — because the media devices a person picks on the
 * pre-join screen must survive into the room without a navigation.
 */
export function MeetingClient({ meeting, viewer }: MeetingClientProps) {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const [stage, setStage] = useState<Stage>(() =>
    meeting.status === "ended"
      ? { kind: "left", reason: "ended" }
      : { kind: "prejoin" },
  );

  const join = useMutation(trpc.join.request.mutationOptions());

  async function handleJoin(choices: PreJoinValues) {
    const session = await join.mutateAsync({
      code: meeting.code,
      displayName: choices.displayName,
      passcode: choices.passcode || undefined,
    });
    setStage({ kind: "room", session, choices });
  }

  if (stage.kind === "left") {
    return (
      <LeftScreen
        reason={stage.reason}
        message={stage.message}
        canRejoin={stage.reason === "left" || stage.reason === "error"}
        onRejoin={() => setStage({ kind: "prejoin" })}
      />
    );
  }

  if (stage.kind === "room") {
    return (
      <MeetingRoom
        meeting={meeting}
        session={stage.session}
        choices={stage.choices}
        onLeave={(reason, message) =>
          setStage({ kind: "left", reason, message })
        }
      />
    );
  }

  return (
    <PreJoin
      meeting={meeting}
      viewer={viewer}
      isJoining={join.isPending}
      error={join.error?.message ?? null}
      onJoin={(values) => {
        handleJoin(values).catch(() => {
          // Surfaced through `join.error` above; nothing else to do here.
        });
      }}
      title={t("meetings.prejoin.readyToJoin")}
    />
  );
}
