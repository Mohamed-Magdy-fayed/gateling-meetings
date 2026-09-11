"use client";

import { useDataChannel } from "@livekit/components-react";
import { useMutation } from "@tanstack/react-query";
import { DoorOpenIcon, MegaphoneIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useTranslation } from "@/features/core/i18n/client";
import { useTRPC } from "@/integrations/trpc/client";
import type { JoinSession } from "../meeting-client";
import { useCurrentRoom } from "./use-current-room";

const BROADCAST_TOPIC = "broadcast";
const decoder = new TextDecoder();

type BreakoutBannerProps = { code: string; session: JoinSession };

/**
 * Shown while this connection sits in a breakout room: the room's name and a
 * way home. Guests prove who they are with the participant key from their
 * join response; the host uses `visit(null)`. Also listens for the host's
 * broadcast messages, which arrive in every room at once.
 */
export function BreakoutBanner({ code, session }: BreakoutBannerProps) {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const current = useCurrentRoom();

  useDataChannel(BROADCAST_TOPIC, (message) => {
    toast(t("meetings.breakouts.broadcastFrom"), {
      description: decoder.decode(message.payload),
      icon: <MegaphoneIcon className="size-4" />,
      duration: 12_000,
    });
  });

  const onError = (error: { message: string }) => toast.error(error.message);
  const returnToMain = useMutation(
    trpc.breakouts.returnToMain.mutationOptions({ onError }),
  );
  const visitMain = useMutation(
    trpc.breakouts.visit.mutationOptions({ onError }),
  );

  if (!current.breakout) return null;

  const isPending = returnToMain.isPending || visitMain.isPending;

  function goHome() {
    if (session.role === "host") {
      visitMain.mutate({ code, roomId: null });
    } else {
      returnToMain.mutate({
        code,
        identity: session.identity,
        participantKey: session.participantKey,
      });
    }
  }

  return (
    <div className="flex items-center justify-center gap-3 bg-primary/15 px-3 py-1.5 text-xs text-primary">
      <span>
        {t("meetings.breakouts.youAreIn", { name: current.breakout.name })}
      </span>
      <Button
        size="sm"
        variant="link"
        className="h-6 text-primary"
        disabled={isPending}
        onClick={goHome}
      >
        <DoorOpenIcon data-icon="inline-start" />
        {t("meetings.breakouts.returnToMain")}
      </Button>
    </div>
  );
}
