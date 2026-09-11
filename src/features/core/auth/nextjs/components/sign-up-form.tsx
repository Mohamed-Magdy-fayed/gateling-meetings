"use client";

import { UserPlus2Icon } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { useAppForm } from "@/components/forms";
import { Button } from "@/components/ui/button";
import {
  FieldDescription,
  FieldSeparator,
  FieldSet,
} from "@/components/ui/field";
import { LoadingSwap } from "@/components/ui/loading-swap";
import { type OAuthProvider, oAuthProviderValues } from "@/drizzle/schema";
import { oAuthSignIn, signUpAction } from "@/features/core/auth/nextjs/actions";
import FormAlert from "@/features/core/auth/nextjs/components/form-alert";
import { useOauthProviderIcon } from "@/features/core/auth/nextjs/components/useOauthProviderIcon";
import { authErrorMessageKey } from "@/features/core/auth/nextjs/lib/error-codes";
import { buildCrossAuthLink } from "@/features/core/auth/nextjs/lib/post-auth-redirect";
import { signUpSchema } from "@/features/core/auth/schemas";
import { useTranslation } from "@/features/core/i18n/client";

function isNextRedirectError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof (error as { digest?: unknown }).digest === "string" &&
    (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

export function SignUpForm() {
  const { t } = useTranslation();
  const [isPending, startTransition] = useTransition();
  const searchParams = useSearchParams();
  const getOauthProviderIcon = useOauthProviderIcon();

  const form = useAppForm({
    defaultValues: {
      name: "",
      phone: "",
      email: searchParams.get("email") ?? "",
      password: "",
    },
    validators: { onSubmit: signUpSchema },
    onSubmit: ({ value }) => {
      const returnTo = searchParams.get("returnTo") ?? undefined;
      startTransition(async () => {
        try {
          await signUpAction(value, returnTo);
        } catch (error) {
          // signUpAction redirects on success, which Next.js implements by
          // throwing a special error — let that one propagate so the
          // navigation actually happens, only toast on a real failure.
          if (isNextRedirectError(error)) throw error;
          toast.error(
            error instanceof Error ? error.message : t("errors.generic"),
          );
        }
      });
    },
  });

  function handleOAuthClick(provider: OAuthProvider) {
    const returnTo = searchParams.get("returnTo") ?? undefined;
    startTransition(() => {
      oAuthSignIn(provider, returnTo);
    });
  }

  return (
    <form
      className="space-y-4 p-6 md:p-8"
      onSubmit={(e) => {
        e.preventDefault();
        form.handleSubmit();
      }}
    >
      <div className="space-y-2 text-center">
        <h1 className="font-semibold text-3xl tracking-tight">
          {t("auth.signUp.title")}
        </h1>
        <p className="text-muted-foreground text-sm">
          {t("auth.signUp.description")}
        </p>
      </div>

      {searchParams.get("error") && (
        <FormAlert
          message={t(authErrorMessageKey(searchParams.get("error")))}
        />
      )}

      {oAuthProviderValues.length > 0 && (
        <div className="grid gap-2">
          {oAuthProviderValues.map((provider) => (
            <Button
              className="h-11 w-full justify-center gap-2"
              disabled={isPending}
              key={provider}
              onClick={() => handleOAuthClick(provider)}
              type="button"
              variant="outline"
            >
              {getOauthProviderIcon(provider)}
              <span className="font-medium text-sm capitalize">{provider}</span>
            </Button>
          ))}
        </div>
      )}

      <FieldSeparator className="mb-2 *:data-[slot=field-separator-content]:bg-card">
        {t("auth.signIn.continueWith")}
      </FieldSeparator>

      <FieldSet
        className="grid gap-2"
        disabled={isPending || form.state.isSubmitting}
      >
        <form.AppField name="name">
          {({ StringField }) => (
            <StringField label={t("auth.signUp.nameLabel")} />
          )}
        </form.AppField>

        <form.AppField name="email">
          {({ EmailField }) => (
            <EmailField
              label={t("auth.signUp.emailLabel")}
              placeholder={t("auth.emailPlaceholder")}
            />
          )}
        </form.AppField>

        <form.AppField name="phone">
          {({ StringField }) => (
            <StringField inputType="tel" label={t("auth.signUp.phoneLabel")} />
          )}
        </form.AppField>

        <form.AppField name="password">
          {({ PasswordField }) => (
            <PasswordField label={t("auth.signUp.passwordLabel")} />
          )}
        </form.AppField>

        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <Button
              className="w-full"
              disabled={isPending || isSubmitting}
              type="submit"
            >
              <LoadingSwap
                isLoading={isPending || isSubmitting}
                loadingText={t("auth.signUp.submitting")}
              >
                <UserPlus2Icon />
                {t("auth.signUp.submit")}
              </LoadingSwap>
            </Button>
          )}
        </form.Subscribe>
      </FieldSet>

      <FieldDescription className="text-center">
        {t("auth.signIn.hasAccount")}{" "}
        <Link
          className="font-medium underline-offset-4 hover:underline"
          href={buildCrossAuthLink("/auth/sign-in", searchParams)}
        >
          {t("auth.signUp.toSignIn")}
        </Link>
      </FieldDescription>
    </form>
  );
}
