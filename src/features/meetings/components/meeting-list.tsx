"use client";

import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import { CopyIcon, PhoneOffIcon, VideoIcon } from "lucide-react";
import { toast } from "sonner";

import { LinkButton } from "@/components/general/link-button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { useTranslation } from "@/features/core/i18n/client";
import { useTRPC } from "@/integrations/trpc/client";
import type { AppRouter } from "@/integrations/trpc/routers/_app";

type Lists = inferRouterOutputs<AppRouter>["meetings"]["listMine"];
type MeetingRow = Lists["upcoming"][number];

const STATUS_VARIANT = {
  scheduled: "info",
  live: "success",
  ended: "secondary",
} as const;

export function MeetingList() {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const { data } = useSuspenseQuery(trpc.meetings.listMine.queryOptions());

  const sections = [
    { key: "live", title: t("meetings.sections.live"), items: data.live },
    {
      key: "upcoming",
      title: t("meetings.sections.upcoming"),
      items: data.upcoming,
    },
    { key: "ended", title: t("meetings.sections.ended"), items: data.ended },
  ].filter((section) => section.items.length > 0);

  if (sections.length === 0) {
    return (
      <EmptyState icon={<VideoIcon />} title={t("meetings.dashboard.empty")} />
    );
  }

  return (
    <div className="space-y-8">
      {sections.map((section) => (
        <section key={section.key} className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {section.title}
            </h2>
            {section.key === "live" && section.items.length > 1 && (
              <EndAllButton count={section.items.length} />
            )}
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {section.items.map((meeting) => (
              <li key={meeting.id}>
                <MeetingCard meeting={meeting} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** Refreshes the dashboard lists after a meeting changes state. */
function useInvalidateMine() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({
      queryKey: trpc.meetings.listMine.queryKey(),
    });
}

function MeetingCard({ meeting }: { meeting: MeetingRow }) {
  const { t, locale } = useTranslation();
  const trpc = useTRPC();
  const invalidate = useInvalidateMine();
  const when = meeting.scheduledAt ?? meeting.startedAt ?? meeting.endedAt;
  const dateFormat = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: meeting.timezone ?? undefined,
  });

  const end = useMutation(
    trpc.meetings.end.mutationOptions({
      onSuccess: () => {
        toast.success(t("meetings.dashboard.ended"));
        invalidate();
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  async function copyLink() {
    await navigator.clipboard.writeText(
      `${window.location.origin}/m/${meeting.code}`,
    );
    toast.success(t("meetings.dashboard.linkCopied"));
  }

  return (
    <Card className="h-full">
      <CardContent className="flex h-full flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-medium">{meeting.title}</p>
            <p className="font-mono text-xs text-muted-foreground">
              {meeting.code}
            </p>
          </div>
          <Badge variant={STATUS_VARIANT[meeting.status]}>
            {t(`meetings.dashboard.status.${meeting.status}`)}
          </Badge>
        </div>
        {when && (
          <p className="text-xs text-muted-foreground">
            {dateFormat.format(when)}
          </p>
        )}
        <div className="mt-auto flex flex-wrap gap-2">
          {meeting.status !== "ended" && (
            <Button variant="secondary" size="sm" onClick={copyLink}>
              <CopyIcon data-icon="inline-start" />
              {t("meetings.dashboard.copyLink")}
            </Button>
          )}
          <LinkButton
            href={`/meetings/${meeting.code}`}
            variant="outline"
            size="sm"
          >
            {t("meetings.dashboard.open")}
          </LinkButton>
          {meeting.status === "live" && (
            <EndConfirm
              title={t("meetings.dashboard.endConfirmTitle")}
              description={t("meetings.dashboard.endConfirmLead")}
              action={t("meetings.dashboard.end")}
              pending={end.isPending}
              onConfirm={() => end.mutate({ code: meeting.code })}
              trigger={
                <Button
                  variant="danger"
                  size="sm"
                  className="ms-auto"
                  disabled={end.isPending}
                />
              }
            >
              <PhoneOffIcon data-icon="inline-start" />
              {t("meetings.dashboard.end")}
            </EndConfirm>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function EndAllButton({ count }: { count: number }) {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const invalidate = useInvalidateMine();
  const endAll = useMutation(
    trpc.meetings.endAll.mutationOptions({
      onSuccess: ({ ended }) => {
        toast.success(t("meetings.dashboard.endedAll", { count: ended }));
        invalidate();
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const label = t("meetings.dashboard.endAll", { count });

  return (
    <EndConfirm
      title={t("meetings.dashboard.endAllConfirmTitle")}
      description={t("meetings.dashboard.endAllConfirmLead")}
      action={label}
      pending={endAll.isPending}
      onConfirm={() => endAll.mutate()}
      trigger={
        <Button variant="danger" size="sm" disabled={endAll.isPending} />
      }
    >
      <PhoneOffIcon data-icon="inline-start" />
      {label}
    </EndConfirm>
  );
}

/**
 * Ending a meeting disconnects people, so it is always behind a confirm —
 * the same solid-danger dialog the in-room "End for all" uses.
 */
function EndConfirm({
  title,
  description,
  action,
  pending,
  onConfirm,
  trigger,
  children,
}: {
  title: string;
  description: string;
  action: string;
  pending: boolean;
  onConfirm: () => void;
  trigger: React.ReactElement;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <AlertDialog>
      <AlertDialogTrigger render={trigger}>{children}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("actions.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={pending}
            className="rounded-full bg-destructive text-white hover:bg-red-600"
          >
            {action}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
