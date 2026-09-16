"use client";

import { type ReactElement, type ReactNode, useId, useState } from "react";
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
import { useTranslation } from "@/features/core/i18n/client";
import { translationKey } from "@/features/core/i18n/global";

/** What the provider's payment page needs to know about the buyer. */
export type BillingContact = { name: string | null; phone: string | null };

export type BillingContactValues = { name: string; phone: string };

const contactSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, translationKey("billing.validation.name"))
    .max(128, translationKey("billing.validation.name")),
  phone: z
    .string()
    .trim()
    .regex(/^\+[1-9]\d{6,14}$/, translationKey("billing.validation.phone")),
});

type BillingContactDialogProps = {
  trigger: ReactElement;
  /** The trigger's label. */
  children: ReactNode;
  title: string;
  lead: ReactNode;
  submitLabel: string;
  /** Prefills the form for an org that has paid before. */
  contact?: BillingContact | null;
  isPending: boolean;
  onSubmit: (values: BillingContactValues) => void;
};

/**
 * The two things Paymob's page needs beyond the account — a name and a
 * phone number — asked once and remembered on the org. Shared by the
 * checkout and the card-update flows, which differ only in what happens
 * after submit (both end in a redirect to the hosted page).
 */
export function BillingContactDialog({
  trigger,
  children,
  title,
  lead,
  submitLabel,
  contact,
  isPending,
  onSubmit,
}: BillingContactDialogProps) {
  const { t } = useTranslation();
  const formId = useId();
  const [open, setOpen] = useState(false);

  const form = useAppForm({
    defaultValues: {
      name: contact?.name ?? "",
      phone: contact?.phone ?? "+20",
    },
    validators: { onSubmit: contactSchema },
    onSubmit: ({ value }) =>
      onSubmit({ name: value.name.trim(), phone: value.phone.trim() }),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger}>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{lead}</DialogDescription>
        </DialogHeader>
        <OverlayFormBody
          formId={formId}
          onSubmit={(event) => {
            event.preventDefault();
            form.handleSubmit();
          }}
        >
          <FieldGroup>
            <form.AppField name="name">
              {(field) => (
                <field.StringField
                  autoFocus
                  label={t("billing.checkout.name")}
                  placeholder={t("billing.checkout.namePlaceholder")}
                />
              )}
            </form.AppField>
            <form.AppField name="phone">
              {(field) => (
                <field.StringField
                  label={t("billing.checkout.phone")}
                  placeholder="+201001234567"
                  inputType="tel"
                  description={t("billing.checkout.phoneHint")}
                />
              )}
            </form.AppField>
          </FieldGroup>
          <p className="pt-3 text-xs text-muted-foreground">
            {t("billing.checkout.redirectNote")}
          </p>
        </OverlayFormBody>
        <DialogFooter>
          <OverlayFormFooterActions>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t("actions.cancel")}
            </Button>
            <OverlayFormSubmitButton formId={formId} disabled={isPending}>
              {submitLabel}
            </OverlayFormSubmitButton>
          </OverlayFormFooterActions>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
