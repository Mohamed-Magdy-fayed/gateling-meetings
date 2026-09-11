"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useTranslation } from "@/features/core/i18n/client";
import { useTRPC } from "@/integrations/trpc/client";
import type { JoinSession, MeetingSummary } from "./meeting-client";

const POLL_INTERVAL_MS = 2_000;

type WaitingScreenProps = {
  meeting: MeetingSummary;
  requestId: string;
  displayName: string;
  onAdmitted: (session: JoinSession) => void;
  onDenied: () => void;
  onEnded: () => void;
  onCancel: () => void;
};

/**
 * The waiting room, from the waiting person's side. Polls `join.status`;
 * every poll doubles as the heartbeat that keeps this request visible to
 * the host. No camera or microphone is open while waiting.
 */
export function WaitingScreen({
  meeting,
  requestId,
  displayName,
  onAdmitted,
  onDenied,
  onEnded,
  onCancel,
}: WaitingScreenProps) {
  const { t } = useTranslation();
  const trpc = useTRPC();

  const status = useQuery(
    trpc.join.status.queryOptions(
      { requestId },
      { refetchInterval: POLL_INTERVAL_MS, refetchIntervalInBackground: true },
    ),
  );
  const cancel = useMutation(trpc.join.cancel.mutationOptions());

  const data = status.data;
  useEffect(() => {
    if (!data) return;
    if (data.status === "admitted") onAdmitted(data);
    else if (data.status === "denied") onDenied();
    else if (data.status === "ended") onEnded();
  }, [data, onAdmitted, onDenied, onEnded]);

  return (
    <main className="grid min-h-svh place-items-center px-4">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div className="mx-auto grid size-14 place-items-center rounded-full bg-primary/10 text-primary">
          <Spinner className="size-6" />
        </div>
        <div className="space-y-2">
          <h1 className="font-display text-2xl">
            {t("meetings.waiting.title")}
          </h1>
          <p className="text-sm text-muted-foreground text-balance">
            {t("meetings.waiting.lead", {
              name: displayName,
              title: meeting.title,
            })}
          </p>
        </div>
        {status.error && (
          <p className="text-sm text-destructive">{status.error.message}</p>
        )}
        <Button
          variant="outline"
          size="lg"
          className="h-10"
          disabled={cancel.isPending}
          onClick={() => {
            cancel.mutate({ requestId });
            onCancel();
          }}
        >
          {t("actions.cancel")}
        </Button>
      </div>
    </main>
  );
}
