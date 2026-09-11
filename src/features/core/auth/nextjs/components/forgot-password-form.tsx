"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { useAppForm } from "@/components/forms/hooks";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { FieldGroup } from "@/components/ui/field";
import { requestPasswordResetAction } from "@/features/core/auth/nextjs/actions";
import { passwordResetRequestSchema } from "@/features/core/auth/schemas";
import { useTranslation } from "@/features/core/i18n/client";

export function ForgotPasswordForm() {
  const { t } = useTranslation();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const form = useAppForm({
    defaultValues: { email: "" },
    validators: { onSubmit: passwordResetRequestSchema },
    onSubmit: ({ value }) => {
      startTransition(async () => {
        const res = await requestPasswordResetAction(value);
        if (res.isError) {
          toast.error(res.message || "");
          return;
        }

        router.push(
          `/auth/reset-password?email=${encodeURIComponent(value.email)}`,
        );
      });
    },
  });

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        form.handleSubmit();
      }}
    >
      <FieldGroup>
        <form.AppField name="email">
          {(field) => (
            <field.EmailField
              autoFocus
              label={t("auth.signIn.emailLabel")}
              placeholder="example@example.com"
            />
          )}
        </form.AppField>
      </FieldGroup>
      <ButtonGroup className="w-full justify-end">
        <Button className="w-full" disabled={isPending} type="submit">
          {isPending
            ? t("auth.passwordReset.submitting")
            : t("auth.passwordReset.submit")}
        </Button>
      </ButtonGroup>
    </form>
  );
}
