"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { CopyIcon } from "lucide-react";
import { toast } from "sonner";

import { LinkButton } from "@/components/general/link-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { useTranslation } from "@/features/core/i18n/client";
import { useTRPC } from "@/integrations/trpc/client";

const STATUS_VARIANT = {
  scheduled: "info",
  live: "success",
  ended: "secondary",
} as const;

export function MeetingList() {
  const { t, locale } = useTranslation();
  const trpc = useTRPC();
  const { data: meetings } = useSuspenseQuery(
    trpc.meetings.listMine.queryOptions(),
  );

  if (meetings.length === 0) {
    return <EmptyState title={t("meetings.dashboard.empty")} />;
  }

  const dateFormat = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  async function copyLink(code: string) {
    await navigator.clipboard.writeText(`${window.location.origin}/m/${code}`);
    toast.success(t("meetings.dashboard.linkCopied"));
  }

  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {meetings.map((meeting) => {
        const when = meeting.scheduledAt ?? meeting.startedAt;
        return (
          <li key={meeting.id}>
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
                <div className="mt-auto flex gap-2">
                  {meeting.status !== "ended" && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => copyLink(meeting.code)}
                    >
                      <CopyIcon data-icon="inline-start" />
                      {t("meetings.dashboard.copyLink")}
                    </Button>
                  )}
                  <LinkButton
                    href={`/m/${meeting.code}`}
                    variant="outline"
                    size="sm"
                  >
                    {t("meetings.dashboard.open")}
                  </LinkButton>
                </div>
              </CardContent>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
