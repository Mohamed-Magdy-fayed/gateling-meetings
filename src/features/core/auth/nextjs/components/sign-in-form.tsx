"use client";

import {
  type AuthenticationResponseJSON,
  startAuthentication,
} from "@simplewebauthn/browser";
import { ArrowLeftIcon, FingerprintIcon, LogInIcon } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Activity, useState, useTransition } from "react";
import { toast } from "sonner";

import { useAppForm } from "@/components/forms/hooks";
import { LinkButton } from "@/components/general/link-button";
import { Button } from "@/components/ui/button";
import {
  FieldDescription,
  FieldSeparator,
  FieldSet,
} from "@/components/ui/field";
import { LoadingSwap } from "@/components/ui/loading-swap";
import { H1, Muted } from "@/components/ui/typography";
import { type OAuthProvider, oAuthProviderValues } from "@/drizzle/schema";
import {
  beginPasskeyAuthenticationAction,
  completePasskeyAuthenticationAction,
  oAuthSignIn,
  signInAction,
} from "@/features/core/auth/nextjs/actions";
import FormAlert from "@/features/core/auth/nextjs/components/form-alert";
import { useOauthProviderIcon } from "@/features/core/auth/nextjs/components/useOauthProviderIcon";
import { authErrorMessageKey } from "@/features/core/auth/nextjs/lib/error-codes";
import { buildCrossAuthLink } from "@/features/core/auth/nextjs/lib/post-auth-redirect";
import { signInSchema } from "@/features/core/auth/schemas";
import { useTranslation } from "@/features/core/i18n/client";

export function SignInForm() {
  const { t } = useTranslation();
  const [isPending, startTransition] = useTransition();
  const [step, setStep] = useState<"email" | "password">("email");
  const searchParams = useSearchParams();
  const getOauthProviderIcon = useOauthProviderIcon();

  const form = useAppForm({
    defaultValues: { email: searchParams.get("email") ?? "", password: "" },
    validators: { onSubmit: signInSchema },
    onSubmit: ({ value }) => {
      startTransition(async () => {
        const returnTo = searchParams.get("returnTo") ?? undefined;
        const result = await signInAction(value, returnTo);
        if (result?.isError) {
          toast.error(result.message);
        }
      });
    },
  });

  async function handlePasskeySignIn() {
    const email = form.getFieldValue("email");
    if (!email) {
      toast.error(t("auth.passkeys.auth.error.emailRequired"));
      return;
    }

    if (typeof window === "undefined" || !window.PublicKeyCredential) {
      toast.error(t("auth.passkeys.auth.error.unsupported"));
      return;
    }

    startTransition(async () => {
      let assertion: AuthenticationResponseJSON | null = null;
      try {
        const beginResult = await beginPasskeyAuthenticationAction(email);
        if (beginResult.isError) {
          toast.error(beginResult.message);
          return;
        }

        assertion = await startAuthentication({
          // The server action returns the DOM lib's ambient
          // `PublicKeyCredentialRequestOptionsJSON` (`type: string`); the
          // browser SDK ships its own structurally-identical copy with a
          // `"public-key"` literal, so TS sees two distinct types here.
          // biome-ignore lint/suspicious/noExplicitAny: DOM-lib vs SDK type mismatch, see comment above
          optionsJSON: beginResult.options as any,
        });
      } catch (error) {
        if (
          error instanceof DOMException &&
          (error.name === "AbortError" || error.name === "NotAllowedError")
        ) {
          toast.error(t("auth.passkeys.auth.error.cancelled"));
        } else {
          toast.error(t("auth.passkeys.auth.error.generic"));
        }
        return;
      }

      if (!assertion) {
        toast.error(t("auth.passkeys.auth.error.generic"));
        return;
      }
      const returnTo = searchParams.get("returnTo") ?? undefined;
      // Only returns (rather than redirecting) on failure — success
      // navigates away via redirect(), so there's nothing to toast then.
      const result = await completePasskeyAuthenticationAction(
        email,
        assertion,
        returnTo,
      );
      if (result?.isError) {
        toast.error(result.message);
      }
    });
  }

  function handleOAuthClick(provider: OAuthProvider) {
    const returnTo = searchParams.get("returnTo") ?? undefined;
    startTransition(() => {
      oAuthSignIn(provider, returnTo);
    });
  }

  async function handleContinueEmail() {
    await form.validateField("email", "submit");
    if (!form.getFieldMeta("email")?.isValid) return;

    setStep("password");
    setTimeout(() => {
      document.getElementById("password")?.focus();
    }, 100);
  }

  function handleBackToEmail() {
    setStep("email");
  }

  const isEmailStep = step === "email";

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (step === "email") {
          handleContinueEmail();
        } else {
          form.handleSubmit();
        }
      }}
    >
      <div className="space-y-2 text-center">
        <H1>{t("auth.signIn.title")}</H1>
        <Muted>{t("auth.signIn.description")}</Muted>
      </div>

      {searchParams.get("error") != null && (
        <FormAlert
          message={t(authErrorMessageKey(searchParams.get("error")))}
        />
      )}
      {searchParams.get("oauthError") != null && (
        <FormAlert
          message={t(authErrorMessageKey(searchParams.get("oauthError")))}
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

      <FieldSet className="grid gap-4" disabled={isPending}>
        <Activity mode={isEmailStep ? "visible" : "hidden"}>
          <form.AppField name="email">
            {(field) => (
              <field.EmailField
                autoFocus
                label={t("auth.signIn.emailLabel")}
                placeholder="example@mail.com"
              />
            )}
          </form.AppField>

          <Button
            className="w-full"
            disabled={isPending}
            onClick={handleContinueEmail}
            type="button"
          >
            <LoadingSwap isLoading={isPending}>
              <LogInIcon />
              {t("auth.signIn.continue")}
            </LoadingSwap>
          </Button>
        </Activity>

        <Activity mode={isEmailStep ? "hidden" : "visible"}>
          <form.AppField name="password">
            {(field) => (
              <field.PasswordField label={t("auth.signIn.passwordLabel")} />
            )}
          </form.AppField>

          <div className="flex w-full justify-end">
            <LinkButton href="/auth/forgot-password" size="sm" variant="link">
              {t("auth.signIn.forgotPassword")}
            </LinkButton>
          </div>

          <div className="flex items-center gap-2">
            <Button
              disabled={isPending}
              onClick={handleBackToEmail}
              type="button"
              variant="outline"
            >
              <ArrowLeftIcon className="rtl:rotate-180" />
              {t("auth.signIn.back")}
            </Button>
            <form.Subscribe selector={(state) => state.isSubmitting}>
              {(isSubmitting) => (
                <Button
                  className="flex-1"
                  disabled={isPending || isSubmitting}
                  type="submit"
                >
                  <LoadingSwap
                    isLoading={isPending || isSubmitting}
                    loadingText={t("auth.signIn.submitting")}
                  >
                    <LogInIcon />
                    {t("auth.signIn.submit")}
                  </LoadingSwap>
                </Button>
              )}
            </form.Subscribe>
          </div>
        </Activity>

        <Button
          disabled={isPending}
          onClick={handlePasskeySignIn}
          type="button"
          variant="outline"
        >
          <FingerprintIcon />
          {isPending
            ? t("auth.passkeys.auth.pending")
            : t("auth.passkeys.auth.button")}
        </Button>
      </FieldSet>

      <FieldDescription className="text-center">
        {t("auth.signIn.noAccount")}{" "}
        <LinkButton
          className="ps-0"
          href={buildCrossAuthLink("/auth/sign-up", searchParams)}
          variant="link"
        >
          {t("auth.signIn.toSignUp")}
        </LinkButton>
      </FieldDescription>
    </form>
  );
}
