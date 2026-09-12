"use client";

import { PhoneOffIcon } from "lucide-react";

import { LinkButton } from "@/components/general/link-button";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/features/core/i18n/client";
import type { LeaveReason, ReturnTarget } from "./meeting-client";

type LeftScreenProps = {
  reason: LeaveReason;
  message?: string;
  canRejoin: boolean;
  onRejoin: () => void;
  returnTarget?: ReturnTarget | null;
};

export function LeftScreen({
  reason,
  message,
  canRejoin,
  onRejoin,
  returnTarget = null,
}: LeftScreenProps) {
  const { t } = useTranslation();

  const headline =
    reason === "ended"
      ? t("meetings.prejoin.ended")
      : reason === "removed"
        ? t("meetings.room.removed")
        : reason === "denied"
          ? t("meetings.waiting.denied")
          : reason === "error"
            ? t("meetings.errors.connection")
            : t("meetings.room.left");

  return (
    <main className="grid min-h-svh place-items-center px-4">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div className="mx-auto grid size-14 place-items-center rounded-full bg-muted text-muted-foreground">
          <PhoneOffIcon className="size-6" />
        </div>
        <div className="space-y-2">
          <h1 className="font-display text-2xl">{headline}</h1>
          <p className="text-sm text-muted-foreground">
            {message ??
              (reason === "ended" ? t("meetings.prejoin.endedLead") : null)}
          </p>
        </div>
        <div className="flex flex-col gap-2">
          {canRejoin && (
            <Button size="lg" className="h-10" onClick={onRejoin}>
              {t("meetings.room.rejoin")}
            </Button>
          )}
          {returnTarget ? (
            <LinkButton
              href={returnTarget.url}
              variant="outline"
              size="lg"
              className="h-10"
            >
              {t("integrations.room.backTo", { name: returnTarget.name })}
            </LinkButton>
          ) : (
            <LinkButton href="/" variant="outline" size="lg" className="h-10">
              {t("meetings.prejoin.backHome")}
            </LinkButton>
          )}
        </div>
      </div>
    </main>
  );
}
