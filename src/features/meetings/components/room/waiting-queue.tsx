"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckIcon, XIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useTranslation } from "@/features/core/i18n/client";
import { useTRPC } from "@/integrations/trpc/client";

const POLL_INTERVAL_MS = 3_000;

/**
 * Host-only. Polls the pending join requests for this meeting and pops a
 * toast with an "Admit" action for each new arrival, so the host notices
 * even with the participants panel closed. Lives in the room shell (mounted
 * for the whole call); the panel below only renders what this returns.
 */
export function useWaitingQueue(code: string, enabled: boolean) {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const listOptions = trpc.host.listWaiting.queryOptions(
    { code },
    {
      enabled,
      refetchInterval: POLL_INTERVAL_MS,
      refetchIntervalInBackground: true,
    },
  );
  const { data: waiting = [] } = useQuery(listOptions);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: listOptions.queryKey });
  const admit = useMutation(
    trpc.host.admit.mutationOptions({ onSuccess: invalidate }),
  );
  const deny = useMutation(
    trpc.host.deny.mutationOptions({ onSuccess: invalidate }),
  );
  const admitAll = useMutation(
    trpc.host.admitAll.mutationOptions({ onSuccess: invalidate }),
  );

  // Toast once per new request id.
  const announcedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const request of waiting) {
      if (announcedRef.current.has(request.id)) continue;
      announcedRef.current.add(request.id);
      toast(t("meetings.waiting.toast", { name: request.displayName }), {
        action: {
          label: t("meetings.waiting.admit"),
          onClick: () => admit.mutate({ code, requestId: request.id }),
        },
      });
    }
  }, [waiting, admit, code, t]);

  return {
    waiting,
    admit: (requestId: string) => admit.mutate({ code, requestId }),
    deny: (requestId: string) => deny.mutate({ code, requestId }),
    admitAll: () => admitAll.mutate({ code }),
  };
}

export type WaitingQueueState = ReturnType<typeof useWaitingQueue>;

/** The queue as a list with Admit / Deny; renders nothing when empty. */
export function WaitingQueue({
  waiting,
  admit,
  deny,
  admitAll,
}: WaitingQueueState) {
  const { t } = useTranslation();
  if (waiting.length === 0) return null;

  return (
    <section className="border-b border-white/10 p-2">
      <div className="flex items-center justify-between px-2 py-1">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("meetings.waiting.queueTitle", { count: waiting.length })}
        </h3>
        {waiting.length > 1 && (
          <Button variant="link" size="sm" onClick={admitAll}>
            {t("meetings.waiting.admitAll")}
          </Button>
        )}
      </div>
      <ul>
        {waiting.map((request) => (
          <li
            key={request.id}
            className="flex items-center gap-2 rounded-lg px-2 py-1.5"
          >
            <span className="min-w-0 flex-1 truncate text-sm">
              {request.displayName}
            </span>
            <Button
              size="icon-sm"
              variant="ghost"
              className="text-destructive"
              aria-label={t("meetings.waiting.deny")}
              onClick={() => deny(request.id)}
            >
              <XIcon />
            </Button>
            <Button
              size="icon-sm"
              aria-label={t("meetings.waiting.admit")}
              onClick={() => admit(request.id)}
            >
              <CheckIcon />
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
