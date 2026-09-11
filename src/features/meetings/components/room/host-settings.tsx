"use client";

import { useMutation } from "@tanstack/react-query";
import { LockIcon, SettingsIcon, UnlockIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import type { MeetingSettings } from "@/drizzle/schemas/meetings";
import { useTranslation } from "@/features/core/i18n/client";
import { useTRPC } from "@/integrations/trpc/client";
import { cn } from "@/lib/utils";

type HostSettingsProps = { code: string; initial: MeetingSettings };

const TOGGLES = [
  "locked",
  "waitingRoom",
  "muteOnEntry",
  "allowScreenShare",
  "allowGuests",
] as const satisfies readonly (keyof MeetingSettings)[];

/**
 * The host's in-room switches. Optimistic: the switch flips immediately and
 * rolls back with a toast if the server disagrees. `locked` also gets its own
 * lock icon on the trigger because it is the one a host reaches for mid-call.
 */
export function HostSettings({ code, initial }: HostSettingsProps) {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const [settings, setSettings] = useState(initial);

  const update = useMutation(
    trpc.meetings.updateSettings.mutationOptions({
      onSuccess: (next) => setSettings(next),
      onError: (error, variables) => {
        toast.error(error.message);
        setSettings((current) => ({
          ...current,
          ...Object.fromEntries(
            Object.keys(variables.settings).map((key) => [
              key,
              !current[key as keyof MeetingSettings],
            ]),
          ),
        }));
      },
    }),
  );

  function toggle(key: keyof MeetingSettings, value: boolean) {
    setSettings((current) => ({ ...current, [key]: value }));
    update.mutate({ code, settings: { [key]: value } });
  }

  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label={t("meetings.host.settings")}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors hover:bg-white/[0.12]",
              settings.locked
                ? "bg-warning/20 text-warning"
                : "bg-white/[0.06] text-neutral-300",
            )}
          />
        }
      >
        {settings.locked ? (
          <LockIcon className="size-3.5" />
        ) : (
          <SettingsIcon className="size-3.5" />
        )}
        <span className="hidden sm:inline">
          {settings.locked
            ? t("meetings.host.lockedBadge")
            : t("meetings.host.settings")}
        </span>
      </PopoverTrigger>
      <PopoverContent align="start" className="dark w-72 space-y-3">
        {TOGGLES.map((key) => (
          <div key={key} className="flex items-center justify-between gap-3">
            <Label htmlFor={`setting-${key}`} className="text-sm font-normal">
              <span className="flex items-center gap-1.5">
                {key === "locked" &&
                  (settings.locked ? (
                    <LockIcon className="size-3.5" />
                  ) : (
                    <UnlockIcon className="size-3.5" />
                  ))}
                {t(`meetings.host.setting.${key}`)}
              </span>
            </Label>
            <Switch
              id={`setting-${key}`}
              checked={settings[key]}
              onCheckedChange={(value) => toggle(key, value)}
            />
          </div>
        ))}
      </PopoverContent>
    </Popover>
  );
}
