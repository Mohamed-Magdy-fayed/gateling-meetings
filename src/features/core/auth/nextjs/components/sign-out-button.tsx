"use client";

import {
  type ButtonHTMLAttributes,
  type ReactNode,
  useTransition,
} from "react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { signOutAction } from "@/features/core/auth/nextjs/actions";
import { useTranslation } from "@/features/core/i18n/client";

type ButtonLikeProps = React.ComponentProps<typeof Button>;

type SignOutButtonProps = { children?: ReactNode } & Pick<
  ButtonLikeProps,
  "variant" | "size" | "className" | "disabled"
> &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick">;

export function SignOutButton({
  children,
  variant = "destructive",
  size,
  className,
  disabled,
  ...buttonProps
}: SignOutButtonProps) {
  const { t } = useTranslation();
  const [isLoading, startTransition] = useTransition();

  function handleSignOut() {
    startTransition(async () => {
      await signOutAction();
    });
  }

  return (
    <Button
      className={className}
      disabled={disabled || isLoading}
      onClick={handleSignOut}
      size={size}
      variant={variant}
      {...buttonProps}
    >
      {isLoading ? (
        <Spinner label={t("common.loading")} />
      ) : (
        (children ?? t("auth.signOut"))
      )}
    </Button>
  );
}
