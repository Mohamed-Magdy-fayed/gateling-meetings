"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckIcon,
  ChevronDownIcon,
  Volume2Icon,
  VolumeOffIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useTranslation } from "@/features/core/i18n/client";
import { useTRPC } from "@/integrations/trpc/client";
import { cn } from "@/lib/utils";
import { PIP_TIMINGS } from "./pip-timings";
import { type KnockSound, useKnockCues } from "./use-knock-cues";
import {
  WaitingDispatcher,
  type WaitingErrorKey,
  type WaitingPending,
  type WaitingSource,
} from "./waiting-dispatcher";

const POLL_INTERVAL_MS = 3_000;

type WaitingRequest = { id: string; displayName: string };

/** What `useWaitingQueue` returns; one poller feeds every surface. */
export type WaitingQueueState = {
  /** Pending requests, minus any already resolved here (optimistic). */
  waiting: WaitingRequest[];
  /** The one action in flight, or null. Every Admit/Deny is disabled meanwhile. */
  pending: WaitingPending;
  /** Translated message for the last failed inline action; cleared by the next. */
  error: string | null;
  admit: (requestId: string) => void;
  deny: (requestId: string) => void;
  admitAll: () => void;
  /** "{name} admitted" / "declined" for a moment after it happened. */
  notice: string | null;
  /** The latest thing to tell a screen reader (a knock, a result). */
  announcement: string;
  /** The viewer's "Knock sound" setting. */
  sound: KnockSound;
};

/**
 * Host-only. Polls the pending join requests for this meeting and pops a
 * toast with an "Admit" action for each new arrival, so the host notices
 * even with the participants panel closed. Lives in the room shell (mounted
 * for the whole call); the participants panel and the floating window only
 * render what this returns. Actions run one at a time (see
 * waiting-dispatcher.ts); a toast disappears as soon as its request is
 * resolved, from wherever.
 */
export function useWaitingQueue(
  code: string,
  enabled: boolean,
): WaitingQueueState {
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
  const { data = [] } = useQuery(listOptions);
  const admitMutation = useMutation(trpc.host.admit.mutationOptions());
  const denyMutation = useMutation(trpc.host.deny.mutationOptions());
  const admitAllMutation = useMutation(trpc.host.admitAll.mutationOptions());

  const [state, setState] = useState<{
    pending: WaitingPending;
    error: WaitingErrorKey | null;
  }>({ pending: null, error: null });
  const depsRef = useRef({ t, queryClient, queryKey: listOptions.queryKey });
  depsRef.current = { t, queryClient, queryKey: listOptions.queryKey };
  const [dispatcher] = useState(
    () =>
      new WaitingDispatcher({
        onChange: setState,
        onToastError: (key) => toast.error(depsRef.current.t(key)),
        beforeRun: () =>
          depsRef.current.queryClient.cancelQueries({
            queryKey: depsRef.current.queryKey,
          }),
        afterRun: () =>
          void depsRef.current.queryClient.invalidateQueries({
            queryKey: depsRef.current.queryKey,
          }),
        isOnline: () => navigator.onLine,
      }),
  );
  const waiting = dispatcher.visible(data);
  const sound = useKnockCues({
    isHost: enabled,
    waitingIds: waiting.map((request) => request.id),
  });

  const [notice, setNotice] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  useEffect(() => {
    if (!notice) return;
    setAnnouncement(notice);
    const id = setTimeout(() => setNotice(null), PIP_TIMINGS.ADMIT_NOTICE_MS);
    return () => clearTimeout(id);
  }, [notice]);
  const report = (
    outcome: Promise<"done" | "failed" | "ignored">,
    text: string,
  ) =>
    void outcome.then((result) => {
      if (result === "done") setNotice(text);
    });
  const nameOf = (requestId: string) =>
    waiting.find((request) => request.id === requestId)?.displayName.trim() ||
    t("meetings.waiting.guestFallback");

  const admit = (requestId: string, source?: WaitingSource) =>
    report(
      dispatcher.run(
        { kind: "one", id: requestId },
        () => admitMutation.mutateAsync({ code, requestId }),
        source,
      ),
      t("meetings.waiting.admittedNotice", { name: nameOf(requestId) }),
    );
  const admitRef = useRef(admit);
  admitRef.current = admit;

  // Toast once per new request id; drop the toast once the id is gone.
  const announcedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const ids = new Set(waiting.map((request) => request.id));
    for (const request of waiting) {
      if (announcedRef.current.has(request.id)) continue;
      announcedRef.current.add(request.id);
      setAnnouncement(
        t("meetings.waiting.toast", { name: request.displayName }),
      );
      toast(t("meetings.waiting.toast", { name: request.displayName }), {
        id: request.id,
        action: {
          label: t("meetings.waiting.admit"),
          onClick: () => admitRef.current(request.id, "toast"),
        },
      });
    }
    for (const id of announcedRef.current) {
      if (!ids.has(id)) toast.dismiss(id);
    }
  }, [waiting, t]);

  return {
    waiting,
    pending: state.pending,
    error: state.error ? t(state.error) : null,
    admit: (requestId) => admit(requestId),
    deny: (requestId) =>
      report(
        dispatcher.run({ kind: "one", id: requestId }, () =>
          denyMutation.mutateAsync({ code, requestId }),
        ),
        t("meetings.waiting.declinedNotice", { name: nameOf(requestId) }),
      ),
    admitAll: () =>
      report(
        dispatcher.run(
          { kind: "all", ids: waiting.map((request) => request.id) },
          () => admitAllMutation.mutateAsync({ code }),
        ),
        t("meetings.waiting.admittedAllNotice", { count: waiting.length }),
      ),
    notice,
    announcement,
    sound,
  };
}

type WaitingQueueProps = WaitingQueueState & {
  /**
   * `compact`: the floating window's strip — one line, with the list behind
   * "Review" when more than one person waits.
   */
  variant?: "default" | "compact";
  /** Names stay hidden until "Review" (a whole-screen share would show them). */
  hideNames?: boolean;
};

/** The queue with Admit / Deny; renders nothing when empty. */
export function WaitingQueue({
  variant = "default",
  ...props
}: WaitingQueueProps) {
  // Kept here, not in the strip: a failed admit brings the row back into
  // the list the host had open, ready for a retry.
  const [isReviewing, setIsReviewing] = useState(false);
  if (props.waiting.length === 0) {
    // The strip lingers for the "admitted" notice, then collapses.
    return variant === "compact" && props.notice ? (
      <p
        role="status"
        className="shrink-0 rounded-md bg-primary/15 px-2 py-1.5 text-xs text-primary"
      >
        {props.notice}
      </p>
    ) : null;
  }
  return variant === "compact" ? (
    <CompactQueue
      {...props}
      isReviewing={isReviewing}
      onReviewingChange={setIsReviewing}
    />
  ) : (
    <FullQueue {...props} />
  );
}

function FullQueue({
  waiting,
  pending,
  error,
  admit,
  deny,
  admitAll,
}: WaitingQueueState) {
  const { t } = useTranslation();
  return (
    <section className="border-b border-white/10 p-2">
      <div className="flex items-center justify-between px-2 py-1">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("meetings.waiting.queueTitle", { count: waiting.length })}
        </h3>
        {waiting.length > 1 && (
          <Button
            variant="link"
            size="sm"
            onClick={admitAll}
            disabled={pending != null}
          >
            {t("meetings.waiting.admitAll")}
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="px-2 text-xs text-destructive">
          {error}
        </p>
      )}
      <ul>
        {waiting.map((request) => (
          <RequestRow
            key={request.id}
            request={request}
            pending={pending}
            admit={admit}
            deny={deny}
          />
        ))}
      </ul>
    </section>
  );
}

function CompactQueue({
  waiting,
  pending,
  error,
  admit,
  deny,
  admitAll,
  hideNames = false,
  notice,
  sound,
  isReviewing,
  onReviewingChange: setIsReviewing,
}: Omit<WaitingQueueProps, "variant"> & {
  isReviewing: boolean;
  onReviewingChange: (next: boolean) => void;
}) {
  const { t } = useTranslation();
  const single = waiting.length === 1 && !hideNames ? waiting[0] : undefined;
  // Back to one line when the list shrinks to one.
  useEffect(() => {
    if (waiting.length < 2 && !hideNames) setIsReviewing(false);
  }, [waiting.length, hideNames, setIsReviewing]);

  return (
    <section
      aria-label={t("meetings.waiting.queueTitle", { count: waiting.length })}
      className="shrink-0 rounded-md bg-primary/15 px-2 py-1 text-xs text-primary"
    >
      {single ? (
        <div className="flex items-center gap-1">
          <ul className="min-w-0 flex-1">
            <RequestRow
              request={single}
              pending={pending}
              admit={admit}
              deny={deny}
              label={t("meetings.waiting.toast", {
                name: displayName(single, t("meetings.waiting.guestFallback")),
              })}
            />
          </ul>
          <KnockSoundToggle sound={sound} />
        </div>
      ) : (
        <div className="flex min-h-8 items-center gap-1">
          <span className="min-w-0 flex-1 truncate font-medium">
            {t("meetings.waiting.queueTitle", { count: waiting.length })}
          </span>
          <Button
            size="sm"
            className="h-8"
            onClick={admitAll}
            disabled={pending != null}
          >
            {pending?.kind === "all" && <Spinner />}
            {t("meetings.waiting.admitAll")}
          </Button>
          <KnockSoundToggle sound={sound} />
          <Button
            size="sm"
            variant="ghost"
            className="h-8"
            aria-expanded={isReviewing}
            onClick={() => setIsReviewing(!isReviewing)}
          >
            {isReviewing
              ? t("meetings.waiting.hideList")
              : t("meetings.waiting.review")}
            <ChevronDownIcon
              aria-hidden
              className={cn(isReviewing && "rotate-180")}
            />
          </Button>
        </div>
      )}
      {isReviewing && (
        <ul className="max-h-[4.5rem] overflow-y-auto">
          {waiting.map((request) => (
            <RequestRow
              key={request.id}
              request={request}
              pending={pending}
              admit={admit}
              deny={deny}
            />
          ))}
        </ul>
      )}
      {notice && <p role="status">{notice}</p>}
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}

/** Per-viewer "Knock sound" switch, remembered in this browser. */
function KnockSoundToggle({ sound }: { sound: KnockSound }) {
  const { t } = useTranslation();
  return (
    <Button
      size="icon-sm"
      variant="ghost"
      aria-label={t("meetings.waiting.knockSound")}
      title={t("meetings.waiting.knockSound")}
      aria-pressed={sound.isOn}
      onClick={() => sound.set(!sound.isOn)}
    >
      {sound.isOn ? <Volume2Icon /> : <VolumeOffIcon />}
    </Button>
  );
}

function displayName(request: WaitingRequest, fallback: string) {
  return request.displayName.trim() || fallback;
}

function RequestRow({
  request,
  pending,
  admit,
  deny,
  label,
}: {
  request: WaitingRequest;
  pending: WaitingPending;
  admit: (id: string) => void;
  deny: (id: string) => void;
  /** Replaces the plain name (the one-line strip's "{name} wants to join"). */
  label?: string;
}) {
  const { t } = useTranslation();
  const name = displayName(request, t("meetings.waiting.guestFallback"));
  const isRowPending = pending?.kind === "one" && pending.id === request.id;
  return (
    <li className="flex min-h-8 items-center gap-1 rounded-lg px-2 py-1">
      <span className="min-w-0 flex-1 truncate text-sm" title={name}>
        {label ?? name}
      </span>
      {isRowPending && <Spinner aria-hidden />}
      <Button
        size="icon-sm"
        variant="ghost"
        className="text-destructive"
        aria-label={t("meetings.waiting.deny")}
        title={t("meetings.waiting.deny")}
        disabled={pending != null}
        onClick={() => deny(request.id)}
      >
        <XIcon />
      </Button>
      <Button
        size="icon-sm"
        aria-label={t("meetings.waiting.admit")}
        title={t("meetings.waiting.admit")}
        disabled={pending != null}
        onClick={() => admit(request.id)}
      >
        <CheckIcon />
      </Button>
    </li>
  );
}
