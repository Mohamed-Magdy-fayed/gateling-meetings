"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PlusIcon } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { useAppForm } from "@/components/forms/hooks";
import {
  OverlayFormBody,
  OverlayFormFooterActions,
  OverlayFormSubmitButton,
} from "@/components/forms/overlay-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FieldGroup } from "@/components/ui/field";
import { type PlanId, planValues } from "@/drizzle/schema";
import { seatLimitSchema } from "@/features/admin/server/schemas";
import { useTranslation } from "@/features/core/i18n/client";
import { translationKey } from "@/features/core/i18n/global";
import { useTRPC } from "@/integrations/trpc/client";
import { fromLocalDateTime } from "./local-date-time";

const formSchema = z.object({
  email: z.email(translationKey("auth.validation.invalidEmail")),
  plan: z.enum(planValues),
  seatLimit: seatLimitSchema,
  expiresAt: z.string(),
  note: z.string().max(2000),
});

type FormValues = z.infer<typeof formSchema>;

export function CreatePlanGrantDialog() {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const formId = useId();
  const [open, setOpen] = useState(false);

  const create = useMutation(
    trpc.admin.grants.create.mutationOptions({
      onSuccess: (result) => {
        toast.success(
          result.appliedNow
            ? t("admin.grants.createdApplied")
            : t("admin.grants.created"),
        );
        queryClient.invalidateQueries({
          queryKey: trpc.admin.grants.list.queryKey(),
        });
        queryClient.invalidateQueries({
          queryKey: trpc.admin.organizations.list.queryKey(),
        });
        setOpen(false);
        form.reset();
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const form = useAppForm({
    defaultValues: {
      email: "",
      plan: "business" as PlanId,
      seatLimit: 1,
      expiresAt: "",
      note: "",
    } satisfies FormValues,
    validators: { onSubmit: formSchema },
    onSubmit: ({ value }) => {
      create.mutate({
        email: value.email,
        plan: value.plan,
        seatLimit: value.seatLimit,
        expiresAt: fromLocalDateTime(value.expiresAt),
        note: value.note.trim() || null,
      });
    },
  });

  const planOptions = planValues.map((plan) => ({
    value: plan,
    label: t(`billing.plans.${plan}.name`),
  }));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="lg" className="h-10" />}>
        <PlusIcon data-icon="inline-start" />
        {t("admin.grants.create")}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("admin.grants.create")}</DialogTitle>
          <DialogDescription>{t("admin.grants.lead")}</DialogDescription>
        </DialogHeader>
        <OverlayFormBody
          formId={formId}
          onSubmit={(event) => {
            event.preventDefault();
            form.handleSubmit();
          }}
        >
          <FieldGroup>
            <form.AppField name="email">
              {(field) => (
                <field.EmailField
                  autoFocus
                  label={t("admin.grants.email")}
                  placeholder="partner@example.com"
                />
              )}
            </form.AppField>
            <form.AppField name="plan">
              {(field) => (
                <field.SelectField
                  label={t("admin.grants.plan")}
                  options={planOptions}
                />
              )}
            </form.AppField>
            <form.AppField name="seatLimit">
              {(field) => (
                <field.NumberField label={t("admin.grants.seatLimit")} />
              )}
            </form.AppField>
            <form.AppField name="expiresAt">
              {(field) => (
                <field.DateTimeField label={t("admin.grants.expiresAt")} />
              )}
            </form.AppField>
            <form.AppField name="note">
              {(field) => (
                <field.TextareaField label={t("admin.grants.note")} rows={2} />
              )}
            </form.AppField>
          </FieldGroup>
        </OverlayFormBody>
        <DialogFooter>
          <OverlayFormFooterActions>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t("actions.cancel")}
            </Button>
            <OverlayFormSubmitButton
              formId={formId}
              disabled={create.isPending}
            >
              {t("admin.grants.submit")}
            </OverlayFormSubmitButton>
          </OverlayFormFooterActions>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
