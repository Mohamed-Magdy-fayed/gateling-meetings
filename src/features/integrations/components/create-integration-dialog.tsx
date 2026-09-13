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
import { useTranslation } from "@/features/core/i18n/client";
import { translationKey } from "@/features/core/i18n/global";
import {
  integrationNameSchema,
  integrationSlugSchema,
  isOrigin,
  webhookUrlSchema,
} from "@/features/integrations/server/schemas";
import { useTRPC } from "@/integrations/trpc/client";
import { ApiKeyDialog, type IssuedCredentials } from "./api-key-dialog";

/** Client-side shape: origins as one textarea; split on submit. */
const formSchema = z.object({
  name: integrationNameSchema,
  slug: integrationSlugSchema,
  webhookUrl: z.union([z.literal(""), webhookUrlSchema]),
  allowedReturnOrigins: z
    .string()
    .refine((raw) => parseOriginList(raw).every(isOrigin), {
      message: translationKey("integrations.admin.validation.origin"),
    }),
  platform: z.boolean(),
});

type FormValues = z.infer<typeof formSchema>;

export function parseOriginList(raw: string): string[] {
  return [
    ...new Set(
      raw
        .split(/[\s,;]+/)
        .map((value) => value.trim().replace(/\/+$/, ""))
        .filter(Boolean),
    ),
  ];
}

type CreateIntegrationDialogProps = {
  /** Only `ADMIN_EMAILS` may mint a platform integration (no org, no caps). */
  isPlatformAdmin: boolean;
};

export function CreateIntegrationDialog({
  isPlatformAdmin,
}: CreateIntegrationDialogProps) {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const formId = useId();
  const [open, setOpen] = useState(false);
  const [issued, setIssued] = useState<IssuedCredentials | null>(null);

  const create = useMutation(
    trpc.integrations.create.mutationOptions({
      onSuccess: (result) => {
        toast.success(t("integrations.admin.created"));
        queryClient.invalidateQueries({
          queryKey: trpc.integrations.list.queryKey(),
        });
        setOpen(false);
        form.reset();
        setIssued({
          apiKey: result.apiKey,
          webhookSecret: result.webhookSecret,
        });
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const form = useAppForm({
    defaultValues: {
      name: "",
      slug: "",
      webhookUrl: "",
      allowedReturnOrigins: "",
      platform: false as boolean,
    } satisfies FormValues,
    validators: { onSubmit: formSchema },
    onSubmit: ({ value }) => {
      create.mutate({
        name: value.name,
        slug: value.slug,
        webhookUrl: value.webhookUrl,
        allowedReturnOrigins: parseOriginList(value.allowedReturnOrigins),
        platform: value.platform,
      });
    },
  });

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger render={<Button size="lg" className="h-10" />}>
          <PlusIcon data-icon="inline-start" />
          {t("integrations.admin.create")}
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("integrations.admin.create")}</DialogTitle>
            <DialogDescription>
              {t("integrations.admin.lead")}
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
                    label={t("integrations.admin.name")}
                    placeholder={t("integrations.admin.namePlaceholder")}
                  />
                )}
              </form.AppField>
              <form.AppField name="slug">
                {(field) => (
                  <field.StringField
                    label={t("integrations.admin.slug")}
                    description={t("integrations.admin.slugHint")}
                    placeholder="atelier"
                  />
                )}
              </form.AppField>
              <form.AppField name="webhookUrl">
                {(field) => (
                  <field.StringField
                    label={t("integrations.admin.webhookUrl")}
                    description={t("integrations.admin.webhookUrlHint")}
                    placeholder="https://atelier.example/api/meetings-webhook"
                    inputType="url"
                  />
                )}
              </form.AppField>
              <form.AppField name="allowedReturnOrigins">
                {(field) => (
                  <field.TextareaField
                    label={t("integrations.admin.allowedReturnOrigins")}
                    description={t(
                      "integrations.admin.allowedReturnOriginsHint",
                    )}
                    placeholder="https://atelier.example"
                    rows={3}
                  />
                )}
              </form.AppField>
              {isPlatformAdmin && (
                <form.AppField name="platform">
                  {(field) => (
                    <field.BooleanField
                      label={t("integrations.admin.platform")}
                      description={t("integrations.admin.platformHint")}
                    />
                  )}
                </form.AppField>
              )}
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
                {t("integrations.admin.submit")}
              </OverlayFormSubmitButton>
            </OverlayFormFooterActions>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ApiKeyDialog credentials={issued} onClose={() => setIssued(null)} />
    </>
  );
}
