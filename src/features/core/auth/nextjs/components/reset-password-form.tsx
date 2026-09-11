"use client";

import { SaveIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { useAppForm } from "@/components/forms/hooks";
import { BackLink } from "@/components/general/back-link";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { FieldSet } from "@/components/ui/field";
import { LoadingSwap } from "@/components/ui/loading-swap";
import { resetPasswordAction } from "@/features/core/auth/nextjs/actions";
import { passwordResetSubmissionSchema } from "@/features/core/auth/schemas";
import { useTranslation } from "@/features/core/i18n/client";

export function ResetPasswordForm({
  initialEmail = "",
}: {
  initialEmail?: string;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const form = useAppForm({
    defaultValues: { email: initialEmail, otp: "", password: "" },
    validators: { onSubmit: passwordResetSubmissionSchema },
    onSubmit: ({ value }) => {
      startTransition(async () => {
        const res = await resetPasswordAction(value);
        if (res.isError) {
          toast.error(res.message);
          return;
        }

        toast.success(res.message ?? t("auth.passwordReset.reset.success"));
        router.push("/auth/sign-in");
      });
    },
  });

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        form.handleSubmit();
      }}
    >
      <FieldSet disabled={isPending}>
        <form.AppField name="email">
          {(field) => (
            <field.EmailField
              disabled={!!initialEmail}
              label={t("auth.signIn.emailLabel")}
              placeholder="example@example.com"
            />
          )}
        </form.AppField>

        <form.AppField name="otp">
          {({ StringField }) => (
            <StringField
              inputType="text"
              label={t("auth.passwordReset.otpLabel")}
              placeholder="123456"
            />
          )}
        </form.AppField>

        <form.AppField name="password">
          {(field) => (
            <field.PasswordField
              label={t("auth.passwordReset.newPasswordLabel")}
            />
          )}
        </form.AppField>
      </FieldSet>
      <ButtonGroup className="w-full gap-2">
        <BackLink
          aria-label={t("auth.signIn.back")}
          href="/auth/forgot-password"
          variant="outline"
        />
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <Button disabled={isPending || isSubmitting} type="submit">
              <LoadingSwap
                isLoading={isPending || isSubmitting}
                loadingText={t("common.loading")}
              >
                <SaveIcon />
                {t("auth.passwordReset.reset.submit")}
              </LoadingSwap>
            </Button>
          )}
        </form.Subscribe>
      </ButtonGroup>
    </form>
  );
}
