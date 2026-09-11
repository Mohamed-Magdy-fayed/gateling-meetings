"use client";

import { useMutation } from "@tanstack/react-query";
import { VideoIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useTranslation } from "@/features/core/i18n/client";
import { useTRPC } from "@/integrations/trpc/client";

type NewMeetingButtonProps = {
  size?: "default" | "lg";
  className?: string;
};

/** Creates an instant meeting and drops the host straight into the room. */
export function NewMeetingButton({
  size = "lg",
  className,
}: NewMeetingButtonProps) {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const router = useRouter();

  const { mutate, isPending } = useMutation(
    trpc.meetings.createInstant.mutationOptions({
      onSuccess: ({ code }) => router.push(`/m/${code}`),
      onError: (error) => toast.error(error.message),
    }),
  );

  return (
    <Button
      size={size}
      className={className}
      onClick={() => mutate({})}
      disabled={isPending}
    >
      <VideoIcon data-icon="inline-start" />
      {isPending ? t("meetings.home.starting") : t("meetings.home.newMeeting")}
    </Button>
  );
}
