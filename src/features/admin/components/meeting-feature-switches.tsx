"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useTranslation } from "@/features/core/i18n/client";
import type {
  MeetingFeatureKey,
  MeetingFeatures,
} from "@/features/meetings/lib/meeting-flags";
import { useTRPC } from "@/integrations/trpc/client";

const SWITCHES: readonly { key: MeetingFeatureKey; experimental?: boolean }[] =
  [
    { key: "annotations" },
    { key: "pipHostControls" },
    { key: "pipAnnotate", experimental: true },
  ];

/**
 * The platform's meeting switches. Each flip saves the whole set at once
 * (what is on screen is exactly what applies); a failed save switches it
 * back and says so.
 */
export function MeetingFeatureSwitches({
  initial,
}: {
  initial: MeetingFeatures;
}) {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const [features, setFeatures] = useState(initial);
  const [hasFailed, setHasFailed] = useState(false);
  const save = useMutation(trpc.admin.features.set.mutationOptions());

  function toggle(key: MeetingFeatureKey, value: boolean) {
    const previous = features;
    const next = { ...features, [key]: value };
    setFeatures(next);
    setHasFailed(false);
    save.mutate(next, {
      onError: () => {
        setFeatures(previous);
        setHasFailed(true);
      },
    });
  }

  return (
    <div className="space-y-4">
      {hasFailed && (
        <Alert variant="destructive">
          <AlertDescription>{t("admin.features.saveFailed")}</AlertDescription>
        </Alert>
      )}
      <ul className="divide-y divide-border">
        {SWITCHES.map(({ key, experimental }) => (
          <li key={key} className="flex items-start gap-4 py-4">
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <Label htmlFor={`feature-${key}`}>
                  {t(`admin.features.${key}.label`)}
                </Label>
                {experimental && (
                  <Badge variant="outline">
                    {t("admin.features.experimental")}
                  </Badge>
                )}
              </div>
              <p
                id={`feature-${key}-description`}
                className="text-sm text-muted-foreground"
              >
                {t(`admin.features.${key}.description`)}
              </p>
            </div>
            <Switch
              id={`feature-${key}`}
              aria-describedby={`feature-${key}-description`}
              checked={features[key]}
              disabled={save.isPending}
              onCheckedChange={(value) => toggle(key, value)}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
