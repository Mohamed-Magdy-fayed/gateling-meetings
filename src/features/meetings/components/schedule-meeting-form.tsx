"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { useAppForm } from "@/components/forms/hooks";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { useTranslation } from "@/features/core/i18n/client";
import { translationKey } from "@/features/core/i18n/global";
import {
  allTimeZones,
  defaultTimeZone,
  instantToWallClock,
  wallClockToInstant,
} from "@/features/meetings/lib/schedule-time";
import {
  meetingTitleSchema,
  passcodeSchema,
} from "@/features/meetings/server/schemas";
import { useTRPC } from "@/integrations/trpc/client";

const DURATIONS = [15, 30, 45, 60, 90, 120, 180] as const;

/** Client-side shape: wall-clock string + zone; converted on submit. */
const formSchema = z.object({
  title: meetingTitleSchema,
  when: z.string().min(1, translationKey("forms.validation.required")),
  durationMinutes: z.string(),
  timezone: z.string().min(1, translationKey("forms.validation.required")),
  passcode: z.union([z.literal(""), passcodeSchema]),
  waitingRoom: z.boolean(),
  invitees: z.string(),
});

type FormValues = z.infer<typeof formSchema>;

/** "a@x.com, b@y.com\nc@z.com" → ["a@x.com","b@y.com","c@z.com"] */
export function parseEmailList(raw: string): string[] {
  return raw
    .split(/[\s,;]+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

type ScheduleMeetingFormProps = {
  /** Present when editing; the form pre-fills and calls `update` instead. */
  existing?: {
    code: string;
    title: string;
    scheduledAt: Date | null;
    durationMinutes: number | null;
    timezone: string | null;
    waitingRoom: boolean;
  };
};

export function ScheduleMeetingForm({ existing }: ScheduleMeetingFormProps) {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const router = useRouter();

  const initialZone = existing?.timezone ?? defaultTimeZone();
  const timeZoneOptions = useMemo(
    () => allTimeZones().map((zone) => ({ value: zone, label: zone })),
    [],
  );
  const durationOptions = DURATIONS.map((minutes) => ({
    value: String(minutes),
    label: t("meetings.schedule.minutes", { count: minutes }),
  }));

  const create = useMutation(
    trpc.meetings.createScheduled.mutationOptions({
      onSuccess: ({ code }) => {
        toast.success(t("meetings.schedule.created"));
        router.push(`/meetings/${code}`);
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const update = useMutation(
    trpc.meetings.update.mutationOptions({
      onSuccess: ({ code }) => {
        toast.success(t("meetings.detail.saved"));
        router.push(`/meetings/${code}`);
        router.refresh();
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const isPending = create.isPending || update.isPending;

  const form = useAppForm({
    defaultValues: {
      title: existing?.title ?? "",
      when: existing?.scheduledAt
        ? instantToWallClock(existing.scheduledAt, initialZone)
        : "",
      durationMinutes: String(existing?.durationMinutes ?? 60),
      timezone: initialZone,
      passcode: "",
      waitingRoom: existing?.waitingRoom ?? true,
      invitees: "",
    } satisfies FormValues,
    validators: { onSubmit: formSchema },
    onSubmit: ({ value }) => {
      const scheduledAt = wallClockToInstant(value.when, value.timezone);
      const shared = {
        title: value.title,
        scheduledAt,
        durationMinutes: Number(value.durationMinutes),
        timezone: value.timezone,
        waitingRoom: value.waitingRoom,
        ...(value.passcode ? { passcode: value.passcode } : {}),
      };
      if (existing) {
        update.mutate({ code: existing.code, ...shared });
      } else {
        create.mutate({ ...shared, invitees: parseEmailList(value.invitees) });
      }
    },
  });

  const minWhen = instantToWallClock(new Date(), initialZone);

  return (
    <form
      className="space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        form.handleSubmit();
      }}
    >
      <FieldGroup>
        <form.AppField name="title">
          {(field) => (
            <field.StringField
              autoFocus
              label={t("meetings.schedule.meetingTitle")}
              placeholder={t("meetings.schedule.titlePlaceholder")}
            />
          )}
        </form.AppField>

        <div className="grid gap-4 sm:grid-cols-2">
          <form.AppField name="when">
            {(field) => (
              <field.DateTimeField
                label={t("meetings.schedule.when")}
                min={minWhen}
              />
            )}
          </form.AppField>
          <form.AppField name="durationMinutes">
            {(field) => (
              <field.SelectField
                label={t("meetings.schedule.duration")}
                options={durationOptions}
              />
            )}
          </form.AppField>
        </div>

        <form.AppField name="timezone">
          {(field) => (
            <field.ComboboxOneField
              label={t("meetings.schedule.timezone")}
              options={timeZoneOptions}
            />
          )}
        </form.AppField>

        <form.AppField name="passcode">
          {(field) => (
            <field.StringField
              label={t("meetings.schedule.passcode")}
              description={t("meetings.schedule.passcodeHint")}
              inputType="text"
            />
          )}
        </form.AppField>

        <form.AppField name="waitingRoom">
          {(field) => (
            <field.BooleanField
              label={t("meetings.schedule.waitingRoom")}
              description={t("meetings.schedule.waitingRoomHint")}
            />
          )}
        </form.AppField>

        {!existing && (
          <form.AppField name="invitees">
            {(field) => (
              <field.TextareaField
                label={t("meetings.schedule.invitees")}
                description={t("meetings.schedule.inviteesHint")}
                placeholder={t("meetings.schedule.inviteesPlaceholder")}
              />
            )}
          </form.AppField>
        )}
      </FieldGroup>

      <Button
        type="submit"
        size="lg"
        className="h-10 w-full sm:w-auto"
        disabled={isPending}
      >
        {isPending
          ? t("meetings.schedule.submitting")
          : existing
            ? t("meetings.detail.save")
            : t("meetings.schedule.submit")}
      </Button>
    </form>
  );
}
