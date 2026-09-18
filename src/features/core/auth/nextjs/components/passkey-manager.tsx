"use client";

import { startRegistration } from "@simplewebauthn/browser";
import { FingerprintIcon, KeyRoundIcon, Trash2Icon } from "lucide-react";
import { startTransition, useEffect, useState } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingSwap } from "@/components/ui/loading-swap";
import { Skeleton } from "@/components/ui/skeleton";
import {
  beginPasskeyRegistrationAction,
  completePasskeyRegistrationAction,
  deletePasskeyAction,
  listPasskeysAction,
} from "@/features/core/auth/nextjs/actions/passkey";
import type { PasskeyListItem } from "@/features/core/auth/types";
import { useTranslation } from "@/features/core/i18n/client";

// Fixed locale/timeZone rather than the environment default — this data is
// only ever populated after mount (see the effect below), but pinning the
// format removes any dependency on server vs. client locale/timezone.
function formatPasskeyTimestamp(iso: string) {
  return new Date(iso).toLocaleString("en-US", { timeZone: "UTC" });
}

/** The passkeys card on the account page: the list, add, and remove. */
export function PasskeyManager() {
  const { t } = useTranslation();
  const [passkeys, setPasskeys] = useState<PasskeyListItem[] | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function refreshPasskeys() {
    const res = await listPasskeysAction();
    if (res.isError) {
      toast.error(res.message);
      return;
    }
    setPasskeys(res.data);
  }

  async function handleRegister() {
    if (typeof window === "undefined" || !window.PublicKeyCredential) {
      toast.error(t("auth.passkeys.register.unsupported"));
      return;
    }

    try {
      setIsRegistering(true);

      const optionsResult = await beginPasskeyRegistrationAction();
      if (optionsResult.isError) {
        toast.error(optionsResult.message);
        return;
      }

      const attestation = await startRegistration({
        // Same DOM-lib-vs-SDK type mismatch as sign-in-form.tsx's passkey flow.
        // biome-ignore lint/suspicious/noExplicitAny: DOM-lib vs SDK type mismatch
        optionsJSON: optionsResult.options as any,
      });
      const completion = await completePasskeyRegistrationAction(attestation);

      if (completion.isError) {
        toast.error(completion.message);
        return;
      }

      await refreshPasskeys();
      toast.success(t("auth.passkeys.register.success"));
    } catch (caught) {
      if (
        caught instanceof DOMException &&
        (caught.name === "AbortError" || caught.name === "NotAllowedError")
      ) {
        toast.error(t("auth.passkeys.register.cancelled"));
        return;
      }

      console.error("Passkey registration failed", caught);
      toast.error(t("auth.passkeys.register.error"));
    } finally {
      setIsRegistering(false);
    }
  }

  // A passkey may be the account's only sign-in method — the caller confirms
  // in a dialog before this runs.
  async function handleDelete(id: string) {
    setBusyId(id);

    try {
      const result = await deletePasskeyAction({ passkeyId: id });
      if (result.isError) {
        toast.error(result.message);
        return;
      }

      await refreshPasskeys();
      toast.success(result.message);
    } catch (caught) {
      console.error("Passkey removal failed", caught);
      toast.error(t("auth.passkeys.delete.error"));
    } finally {
      setBusyId(null);
    }
  }

  // Runs once on mount only — refreshPasskeys is redefined every render, so
  // including it would refetch on every render instead.
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional mount-only fetch
  useEffect(() => {
    startTransition(() => {
      refreshPasskeys();
    });
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-base">
          {t("auth.passkeys.pageTitle")}
        </CardTitle>
        <CardDescription className="text-sm">
          {t("auth.passkeys.pageDescription")}
        </CardDescription>
        <CardAction>
          <Button disabled={isRegistering} onClick={handleRegister}>
            <LoadingSwap
              isLoading={isRegistering}
              loadingText={t("auth.passkeys.registering")}
            >
              <FingerprintIcon data-icon="inline-start" />
              {t("auth.passkeys.add")}
            </LoadingSwap>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {passkeys === null ? (
          <Skeleton className="h-16 w-full" />
        ) : passkeys.length === 0 ? (
          <EmptyState
            compact
            icon={<FingerprintIcon />}
            title={t("auth.passkeys.list.empty")}
            description={t("auth.passkeys.list.emptyLead")}
          />
        ) : (
          <ul className="divide-y divide-border">
            {passkeys.map((item) => (
              <li
                key={item.id}
                className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-md bg-accent text-accent-foreground">
                  <KeyRoundIcon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {item.label ?? t("auth.passkeys.list.defaultLabel")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("auth.passkeys.list.created")}{" "}
                    {formatPasskeyTimestamp(item.createdAt)}
                    {item.lastUsedAt && (
                      <>
                        {" · "}
                        {t("auth.passkeys.list.lastUsed")}{" "}
                        {formatPasskeyTimestamp(item.lastUsedAt)}
                      </>
                    )}
                  </p>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger
                    render={
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={busyId === item.id}
                      />
                    }
                  >
                    <Trash2Icon data-icon="inline-start" />
                    {busyId === item.id
                      ? t("auth.passkeys.deleting")
                      : t("auth.passkeys.delete.label")}
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        {t("auth.passkeys.delete.label")}
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        {t("auth.passkeys.delete.confirm")}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>
                        {t("actions.cancel")}
                      </AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => handleDelete(item.id)}
                        className="rounded-full bg-destructive text-white hover:bg-red-600"
                      >
                        {t("auth.passkeys.delete.label")}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
