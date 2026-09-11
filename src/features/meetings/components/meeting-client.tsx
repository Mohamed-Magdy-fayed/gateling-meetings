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
import { WaitingScreen } from "./waiting-screen";

type RouterOutputs = inferRouterOutputs<AppRouter>;
export type MeetingSummary = RouterOutputs["meetings"]["getByCode"];
export type JoinSession = Extract<
  RouterOutputs["join"]["request"],
  { status: "admitted" }
>;

export type Viewer = { defaultName: string; isSignedIn: boolean };

export type LeaveReason = "left" | "ended" | "removed" | "denied" | "error";

type Stage =
  | { kind: "prejoin" }
  | { kind: "waiting"; requestId: string; choices: PreJoinValues }
  | { kind: "room"; session: JoinSession; choices: PreJoinValues }
  | { kind: "left"; reason: LeaveReason; message?: string };

type MeetingClientProps = {
  meeting: MeetingSummary;
  viewer: Viewer;
  /** From an emailed invite link — skips passcode and waiting room. */
  inviteToken: string | null;
};

/**
 * The `/m/[code]` page is one client component with four stages —
 * pre-join → (waiting) → room → left — because the media devices a person
 * picks on the pre-join screen must survive into the room without a
 * navigation.
 */
export function MeetingClient({
  meeting,
  viewer,
  inviteToken,
}: MeetingClientProps) {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const [stage, setStage] = useState<Stage>(() =>
    meeting.status === "ended"
      ? { kind: "left", reason: "ended" }
      : { kind: "prejoin" },
  );

  const join = useMutation(trpc.join.request.mutationOptions());

  async function handleJoin(choices: PreJoinValues) {
    const result = await join.mutateAsync({
      code: meeting.code,
      displayName: choices.displayName,
      passcode: choices.passcode || undefined,
      inviteToken: inviteToken ?? undefined,
    });
    if (result.status === "pending") {
      setStage({ kind: "waiting", requestId: result.requestId, choices });
    } else {
      setStage({ kind: "room", session: result, choices });
    }
  }

  switch (stage.kind) {
    case "left":
      return (
        <LeftScreen
          reason={stage.reason}
          message={stage.message}
          canRejoin={stage.reason === "left" || stage.reason === "error"}
          onRejoin={() => setStage({ kind: "prejoin" })}
        />
      );

    case "waiting":
      return (
        <WaitingScreen
          meeting={meeting}
          requestId={stage.requestId}
          displayName={stage.choices.displayName}
          onAdmitted={(session) =>
            setStage({ kind: "room", session, choices: stage.choices })
          }
          onDenied={() => setStage({ kind: "left", reason: "denied" })}
          onEnded={() => setStage({ kind: "left", reason: "ended" })}
          onCancel={() => setStage({ kind: "prejoin" })}
        />
      );

    case "room":
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

    default:
      return (
        <PreJoin
          meeting={meeting}
          viewer={viewer}
          hasInvite={inviteToken != null}
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
}
