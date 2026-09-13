"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { useAppForm } from "@/components/forms/hooks";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import { type PlanId, planValues } from "@/drizzle/schema";
import {
  adminPlanSourceSchema,
  seatLimitSchema,
} from "@/features/admin/server/schemas";
import { useTranslation } from "@/features/core/i18n/client";
import { useTRPC } from "@/integrations/trpc/client";
import { fromLocalDateTime, toLocalDateTime } from "./local-date-time";

const formSchema = z.object({
  plan: z.enum(planValues),
  planSource: adminPlanSourceSchema,
  seatLimit: seatLimitSchema,
  planExpiresAt: z.string(),
  planNote: z.string().max(2000),
});

type FormValues = z.infer<typeof formSchema>;

type OrganizationPlanFormProps = {
  organization: {
    id: string;
    plan: PlanId;
    planSource: "free" | "subscription" | "manual" | "trial";
    seatLimit: number;
    planExpiresAt: Date | null;
    planNote: string | null;
  };
};

/**
 * The comp lever. A `subscription` org shows as such but the form can only
 * write `free | manual | trial` — a paying org an admin edits becomes a
 * manually-granted one, which billing webhooks then leave alone.
 */
export function OrganizationPlanForm({
  organization,
}: OrganizationPlanFormProps) {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const formId = useId();

  const setPlan = useMutation(
    trpc.admin.organizations.setPlan.mutationOptions({
      onSuccess: () => {
        toast.success(t("admin.setPlan.saved"));
        queryClient.invalidateQueries({
          queryKey: trpc.admin.organizations.get.queryKey({
            id: organization.id,
          }),
        });
        queryClient.invalidateQueries({
          queryKey: trpc.admin.organizations.list.queryKey(),
        });
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const form = useAppForm({
    defaultValues: {
      plan: organization.plan,
      planSource:
        organization.planSource === "subscription"
          ? "manual"
          : organization.planSource,
      seatLimit: organization.seatLimit,
      planExpiresAt: toLocalDateTime(organization.planExpiresAt),
      planNote: organization.planNote ?? "",
    } satisfies FormValues,
    validators: { onSubmit: formSchema },
    onSubmit: ({ value }) => {
      setPlan.mutate({
        id: organization.id,
        plan: value.plan,
        planSource: value.planSource,
        seatLimit: value.seatLimit,
        planExpiresAt: fromLocalDateTime(value.planExpiresAt),
        planNote: value.planNote.trim() || null,
      });
    },
  });

  const planOptions = planValues.map((plan) => ({
    value: plan,
    label: t(`billing.plans.${plan}.name`),
  }));
  const sourceOptions = adminPlanSourceSchema.options.map((source) => ({
    value: source,
    label: t(`admin.setPlan.sources.${source}`),
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("admin.setPlan.title")}</CardTitle>
        <CardDescription>{t("admin.setPlan.lead")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          id={formId}
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            form.handleSubmit();
          }}
        >
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <form.AppField name="plan">
                {(field) => (
                  <field.SelectField
                    label={t("admin.setPlan.plan")}
                    options={planOptions}
                  />
                )}
              </form.AppField>
              <form.AppField name="planSource">
                {(field) => (
                  <field.SelectField
                    label={t("admin.setPlan.source")}
                    options={sourceOptions}
                  />
                )}
              </form.AppField>
              <form.AppField name="seatLimit">
                {(field) => (
                  <field.NumberField label={t("admin.setPlan.seatLimit")} />
                )}
              </form.AppField>
              <form.AppField name="planExpiresAt">
                {(field) => (
                  <field.DateTimeField
                    label={t("admin.setPlan.expiresAt")}
                    description={t("admin.setPlan.expiresAtHint")}
                  />
                )}
              </form.AppField>
            </div>
            <form.AppField name="planNote">
              {(field) => (
                <field.TextareaField
                  label={t("admin.setPlan.note")}
                  placeholder={t("admin.setPlan.notePlaceholder")}
                  rows={3}
                />
              )}
            </form.AppField>
          </FieldGroup>
          <div className="flex justify-end">
            <Button type="submit" disabled={setPlan.isPending}>
              {t("admin.setPlan.submit")}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
