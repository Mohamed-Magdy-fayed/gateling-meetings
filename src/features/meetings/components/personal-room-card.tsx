"use client";

import { useMutation } from "@tanstack/react-query";
import { CopyIcon, DoorOpenIcon, Share2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { LinkButton } from "@/components/general/link-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useTranslation } from "@/features/core/i18n/client";
import { shareLink, useCanShare } from "@/features/meetings/lib/share-link";
import { useTRPC } from "@/integrations/trpc/client";

type PersonalRoomCardProps = { code: string | null };

/**
 * Zoom's "Personal Meeting ID", Meet's permanent nickname link: one room per
 * host with a code that never rotates. Created on first click.
 */
export function PersonalRoomCard({ code }: PersonalRoomCardProps) {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const router = useRouter();
  const canShare = useCanShare();

  const create = useMutation(
    trpc.meetings.getPersonalRoom.mutationOptions({
      onSuccess: () => router.refresh(),
      onError: (error) => toast.error(error.message),
    }),
  );

  function roomUrl() {
    return `${window.location.origin}/m/${code}`;
  }

  async function copyLink() {
    await navigator.clipboard.writeText(roomUrl());
    toast.success(t("meetings.dashboard.linkCopied"));
  }

  async function share() {
    const result = await shareLink({
      title: t("appName"),
      text: t("meetings.personalRoom.shareText"),
      url: roomUrl(),
    });
    if (result === "unsupported") await copyLink();
  }

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <p className="font-medium">{t("meetings.personalRoom.title")}</p>
          <p className="text-sm text-muted-foreground">
            {t("meetings.personalRoom.lead")}
          </p>
          {code && (
            <p className="mt-1 font-mono text-xs text-muted-foreground">
              /m/{code}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {code ? (
            <>
              <Button variant="secondary" size="sm" onClick={copyLink}>
                <CopyIcon data-icon="inline-start" />
                {t("meetings.dashboard.copyLink")}
              </Button>
              {canShare && (
                <Button variant="secondary" size="sm" onClick={share}>
                  <Share2Icon data-icon="inline-start" />
                  {t("meetings.personalRoom.share")}
                </Button>
              )}
              <LinkButton href={`/m/${code}`} size="sm">
                <DoorOpenIcon data-icon="inline-start" />
                {t("meetings.personalRoom.open")}
              </LinkButton>
            </>
          ) : (
            <Button
              size="sm"
              disabled={create.isPending}
              onClick={() => create.mutate()}
            >
              {t("meetings.personalRoom.create")}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
