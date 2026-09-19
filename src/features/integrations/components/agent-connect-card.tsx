"use client";

import { BotIcon, CopyIcon } from "lucide-react";
import { toast } from "sonner";

import { LinkButton } from "@/components/general/link-button";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useTranslation } from "@/features/core/i18n/client";

/**
 * How to point an AI agent at the MCP endpoint with an integration key.
 * Sits under the keys so the two things a developer needs are together.
 */
export function AgentConnectCard({ mcpUrl }: { mcpUrl: string }) {
  const { t } = useTranslation();
  const command = `claude mcp add --transport http gateling-meetings ${mcpUrl} --header "Authorization: Bearer gm_live_…"`;

  async function copy(value: string) {
    await navigator.clipboard.writeText(value);
    toast.success(t("integrations.admin.copied"));
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent text-primary">
            <BotIcon className="size-4" />
          </span>
          <div className="space-y-1">
            <CardTitle>{t("integrations.admin.mcp.title")}</CardTitle>
            <CardDescription>
              {t("integrations.admin.mcp.lead")}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-flex min-w-0 items-center gap-1 rounded-full bg-muted ps-3 pe-1 py-0.5 font-mono">
            <span className="truncate" dir="ltr">
              {mcpUrl}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="size-5 shrink-0 rounded-full"
              aria-label={t("integrations.admin.mcp.copyUrl")}
              onClick={() => copy(mcpUrl)}
            >
              <CopyIcon />
            </Button>
          </span>
        </div>
        <div className="relative rounded-md border border-border bg-muted">
          <pre
            className="overflow-x-auto p-3 pe-12 font-mono text-xs leading-relaxed"
            dir="ltr"
          >
            <code>{command}</code>
          </pre>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="absolute top-1.5 end-1.5 rounded-full"
            aria-label={t("integrations.admin.mcp.copyCommand")}
            onClick={() => copy(command)}
          >
            <CopyIcon />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {t("integrations.admin.mcp.keyHint")}
        </p>
        <LinkButton
          href="/settings/integrations/docs"
          variant="outline"
          size="sm"
        >
          {t("integrations.admin.mcp.readDocs")}
        </LinkButton>
      </CardContent>
    </Card>
  );
}
