"use client";

import { useQuery } from "@tanstack/react-query";
import { TimerIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { LinkButton } from "@/components/general/link-button";
import { useTranslation } from "@/features/core/i18n/client";
import { useTRPC } from "@/integrations/trpc/client";

type DurationBannerProps = { code: string; isHost: boolean };

/** Show the countdown once this much of the meeting is left. */
const WARN_BEFORE_MS = 10 * 60_000;
/** The room's `startedAt` is stamped by a webhook seconds after it opens. */
const POLL_MS = 30_000;

function formatRemaining(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/**
 * The plan's meeting-length cap, made visible before it bites. Polls the
 * meeting summary because `endsAt` is derived from when the LiveKit room
 * actually opened, which the server learns a moment after the first person
 * connects — the value at join time can be stale (a personal room keeps
 * its previous session's clock until then) and is simply hidden.
 */
export function DurationBanner({ code, isHost }: DurationBannerProps) {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const { data } = useQuery(
    trpc.meetings.getByCode.queryOptions(
      { code },
      { refetchInterval: POLL_MS, refetchOnWindowFocus: true },
    ),
  );
  const endsAt = data?.endsAt ? new Date(data.endsAt).getTime() : null;

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (endsAt == null) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [endsAt]);

  if (endsAt == null) return null;
  const remaining = endsAt - now;
  if (remaining <= 0 || remaining > WARN_BEFORE_MS) return null;

  return (
    <div className="flex shrink-0 items-center justify-center gap-3 bg-warning/20 px-3 py-1.5 text-xs text-warning">
      <TimerIcon className="size-4" />
      <span className="tabular-nums">
        {t("billing.room.endsIn", { time: formatRemaining(remaining) })}
      </span>
      <span className="opacity-80">· {t("billing.room.cappedBy")}</span>
      {isHost && (
        <LinkButton
          href="/settings/billing"
          target="_blank"
          size="sm"
          variant="link"
          className="h-6 text-warning"
        >
          {t("billing.room.upgrade")}
        </LinkButton>
      )}
    </div>
  );
}
