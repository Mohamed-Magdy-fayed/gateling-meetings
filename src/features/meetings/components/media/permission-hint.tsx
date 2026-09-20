"use client";

import { useSyncExternalStore } from "react";

import { useTranslation } from "@/features/core/i18n/client";
import {
  type BrowserFamily,
  detectBrowserFamily,
  isIOS,
} from "@/features/meetings/lib/media";

type Platform = BrowserFamily | "ios";

const noop = () => () => {};
const detect = (): Platform => (isIOS() ? "ios" : detectBrowserFamily());
const serverPlatform = (): Platform => "other";

/**
 * "Where to click to unblock it" for the browser we're actually in. The
 * user agent is only known on the client, so this is an external-store read
 * with a neutral server snapshot rather than a hydration mismatch.
 */
export function PermissionHint({
  includeSystem = false,
  className,
}: {
  /** Also mention OS-level privacy settings (allowed-but-silent case). */
  includeSystem?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const platform = useSyncExternalStore(noop, detect, serverPlatform);
  return (
    <div className={className}>
      <p>{t(`meetings.media.hint.${platform}`)}</p>
      {includeSystem && <p>{t("meetings.media.hint.system")}</p>}
    </div>
  );
}
