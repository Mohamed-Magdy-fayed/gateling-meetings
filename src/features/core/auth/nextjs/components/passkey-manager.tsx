"use client";

import { startRegistration } from "@simplewebauthn/browser";
import { FingerprintIcon } from "lucide-react";
import { startTransition, useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { LoadingSwap } from "@/components/ui/loading-swap";
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

export function PasskeyManager() {
  const { t } = useTranslation();
  const [passkeys, setPasskeys] = useState<PasskeyListItem[]>([]);
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

  async function handleDelete(id: string) {
    // A passkey may be the account's only sign-in method — confirm before
    // an irreversible removal instead of firing immediately on click.
    if (!window.confirm(t("auth.passkeys.delete.confirm"))) return;

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
    <div className="space-y-4">
      <ul className="space-y-3">
        {passkeys.length === 0 && (
          <li className="rounded border border-dashed px-3 py-4 text-muted-foreground text-sm">
            {t("auth.passkeys.list.empty")}
          </li>
        )}
        {passkeys.map((item) => (
          <li
            className="flex flex-wrap items-center justify-between gap-3 rounded border px-3 py-2"
            key={item.id}
          >
            <div className="space-y-1">
              <p className="font-medium">
                {item.label ?? t("auth.passkeys.list.defaultLabel")}
              </p>
              <p className="text-muted-foreground text-xs">
                {t("auth.passkeys.list.created")}{" "}
                {formatPasskeyTimestamp(item.createdAt)}
              </p>
              {item.lastUsedAt && (
                <p className="text-muted-foreground text-xs">
                  {t("auth.passkeys.list.lastUsed")}{" "}
                  {formatPasskeyTimestamp(item.lastUsedAt)}
                </p>
              )}
            </div>
            <Button
              disabled={busyId === item.id}
              onClick={() => handleDelete(item.id)}
              variant="outline"
            >
              {busyId === item.id
                ? t("auth.passkeys.deleting")
                : t("auth.passkeys.delete.label")}
            </Button>
          </li>
        ))}
      </ul>

      <Button disabled={isRegistering} onClick={handleRegister}>
        <LoadingSwap
          isLoading={isRegistering}
          loadingText={t("auth.passkeys.registering")}
        >
          <FingerprintIcon />
          {t("auth.passkeys.add")}
        </LoadingSwap>
      </Button>
    </div>
  );
}
