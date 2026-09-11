"use client";

import { useMutation } from "@tanstack/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import {
  CalendarPlusIcon,
  CopyIcon,
  LockIcon,
  PencilIcon,
  Trash2Icon,
  UsersIcon,
  VideoIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useTranslation } from "@/features/core/i18n/client";
import { googleCalendarUrl } from "@/features/meetings/lib/calendar";
import { useTRPC } from "@/integrations/trpc/client";
import type { AppRouter } from "@/integrations/trpc/routers/_app";
import { parseEmailList } from "./schedule-meeting-form";

type HostMeeting = inferRouterOutputs<AppRouter>["meetings"]["getForHost"];

const STATUS_VARIANT = {
  scheduled: "info",
  live: "success",
  ended: "secondary",
} as const;

export function MeetingDetail({ meeting }: { meeting: HostMeeting }) {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const router = useRouter();
  const link = `${typeof window === "undefined" ? "" : window.location.origin}/m/${meeting.code}`;

  const remove = useMutation(
    trpc.meetings.delete.mutationOptions({
      onSuccess: () => {
        toast.success(t("meetings.detail.deleted"));
        router.push("/dashboard");
        router.refresh();
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  async function copyLink() {
    await navigator.clipboard.writeText(link);
    toast.success(t("meetings.dashboard.linkCopied"));
  }

  const when = meeting.scheduledAt ?? meeting.startedAt;
  const whenKey =
    meeting.status === "scheduled"
      ? "meetings.detail.startsAt"
      : meeting.status === "ended"
        ? "meetings.detail.endedAt"
        : "meetings.detail.startedAt";
  const whenValue = meeting.status === "ended" ? meeting.endedAt : when;

  const calendarEvent = meeting.scheduledAt
    ? {
        title: meeting.title,
        description: link,
        url: link,
        start: meeting.scheduledAt,
        end: new Date(
          meeting.scheduledAt.getTime() +
            (meeting.durationMinutes ?? 60) * 60_000,
        ),
      }
    : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl">{meeting.title}</h1>
            <Badge variant={STATUS_VARIANT[meeting.status]}>
              {t(`meetings.dashboard.status.${meeting.status}`)}
            </Badge>
          </div>
          {whenValue && (
            <p className="text-sm text-muted-foreground">
              {t(whenKey, { when: whenValue })}
              {meeting.durationMinutes && meeting.status === "scheduled" && (
                <>
                  {" "}
                  ·{" "}
                  {t("meetings.detail.duration", {
                    minutes: meeting.durationMinutes,
                  })}
                </>
              )}
              {meeting.timezone && <> · {meeting.timezone}</>}
            </p>
          )}
        </div>
        {meeting.status !== "ended" && (
          <LinkButton href={`/m/${meeting.code}`} size="lg" className="h-10">
            <VideoIcon data-icon="inline-start" />
            {meeting.status === "live"
              ? t("meetings.detail.rejoin")
              : t("meetings.detail.start")}
          </LinkButton>
        )}
      </div>

      <Card>
        <CardContent className="space-y-4 p-4">
          <div>
            <p className="text-xs font-medium text-muted-foreground">
              {t("meetings.detail.link")}
            </p>
            <div className="mt-1 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-md bg-muted px-2 py-1.5 font-mono text-sm">
                {link}
              </code>
              <Button
                variant="secondary"
                size="icon-lg"
                onClick={copyLink}
                aria-label={t("meetings.dashboard.copyLink")}
              >
                <CopyIcon />
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1">
              <LockIcon className="size-3" />
              {meeting.hasPasscode
                ? t("meetings.detail.passcodeSet")
                : t("meetings.detail.noPasscode")}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1">
              <UsersIcon className="size-3" />
              {meeting.settings.waitingRoom
                ? t("meetings.detail.waitingRoomOn")
                : t("meetings.detail.waitingRoomOff")}
            </span>
          </div>
          {calendarEvent && meeting.status === "scheduled" && (
            <div className="flex flex-wrap gap-2">
              <LinkButton
                href={googleCalendarUrl(calendarEvent)}
                target="_blank"
                rel="noopener noreferrer"
                variant="outline"
              >
                <CalendarPlusIcon data-icon="inline-start" />
                {t("meetings.detail.addToGoogle")}
              </LinkButton>
              <LinkButton
                href={`/meetings/${meeting.code}/edit`}
                variant="ghost"
              >
                <PencilIcon data-icon="inline-start" />
                {t("meetings.detail.edit")}
              </LinkButton>
            </div>
          )}
        </CardContent>
      </Card>

      {!meeting.isPersonalRoom && <Invitees meeting={meeting} />}

      {meeting.status !== "ended" && !meeting.isPersonalRoom && (
        <AlertDialog>
          <AlertDialogTrigger render={<Button variant="destructive" />}>
            <Trash2Icon data-icon="inline-start" />
            {t("meetings.detail.delete")}
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("meetings.detail.delete")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("meetings.detail.deleteConfirm")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("actions.cancel")}</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-white hover:bg-destructive/90"
                onClick={() => remove.mutate({ code: meeting.code })}
              >
                {t("actions.delete")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}

function Invitees({ meeting }: { meeting: HostMeeting }) {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const router = useRouter();
  const [draft, setDraft] = useState("");

  const send = useMutation(
    trpc.invites.send.mutationOptions({
      onSuccess: ({ sent }) => {
        toast.success(t("meetings.detail.invitesSent", { count: sent }));
        setDraft("");
        router.refresh();
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  function submit(event: FormEvent) {
    event.preventDefault();
    const emails = parseEmailList(draft);
    if (emails.length === 0) return;
    send.mutate({ code: meeting.code, emails });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("meetings.detail.invitees")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {meeting.invites.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("meetings.detail.noInvitees")}
          </p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {meeting.invites.map((invite) => (
              <li
                key={invite.id}
                className="flex items-center justify-between gap-2 py-2"
              >
                <span className="truncate">{invite.name ?? invite.email}</span>
                <span className="text-xs text-muted-foreground">
                  {invite.sentAt
                    ? t("meetings.detail.sent")
                    : t("meetings.detail.pending")}
                </span>
              </li>
            ))}
          </ul>
        )}
        {meeting.status !== "ended" && (
          <form onSubmit={submit} className="space-y-2">
            <Textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={t("meetings.schedule.inviteesPlaceholder")}
              aria-label={t("meetings.detail.addInvitees")}
              rows={2}
            />
            <Button
              type="submit"
              variant="secondary"
              disabled={send.isPending || !draft.trim()}
            >
              {t("meetings.detail.addInvitees")}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
