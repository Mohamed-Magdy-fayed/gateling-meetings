"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useId } from "react";
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
} from "@/components/ui/dialog";
import { FieldGroup } from "@/components/ui/field";
import { useTranslation } from "@/features/core/i18n/client";
import { translationKey } from "@/features/core/i18n/global";
import { useTRPC } from "@/integrations/trpc/client";

const formSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, translationKey("forms.validation.required"))
    .max(128, translationKey("forms.validation.max128")),
});

type CreateOrganizationDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function CreateOrganizationDialog({
  open,
  onOpenChange,
}: CreateOrganizationDialogProps) {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const router = useRouter();
  const formId = useId();

  const create = useMutation(
    trpc.organizations.create.mutationOptions({
      onSuccess: () => {
        toast.success(t("organizations.settings.created"));
        onOpenChange(false);
        form.reset();
        router.push("/settings/organization");
        router.refresh();
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const form = useAppForm({
    defaultValues: { name: "" },
    validators: { onSubmit: formSchema },
    onSubmit: ({ value }) => create.mutate({ name: value.name }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("organizations.settings.createTitle")}</DialogTitle>
          <DialogDescription>
            {t("organizations.settings.createLead")}
          </DialogDescription>
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
                  label={t("organizations.settings.createName")}
                />
              )}
            </form.AppField>
          </FieldGroup>
        </OverlayFormBody>
        <DialogFooter>
          <OverlayFormFooterActions>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t("actions.cancel")}
            </Button>
            <OverlayFormSubmitButton
              formId={formId}
              disabled={create.isPending}
            >
              {t("organizations.settings.createSubmit")}
            </OverlayFormSubmitButton>
          </OverlayFormFooterActions>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
