"use client";

import { MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";
import type { ComponentProps } from "react";

import { Button } from "@/components/ui/button";
import { Swap, SwapOff, SwapOn } from "@/components/ui/swap";
import { useTranslation } from "@/features/core/i18n/client";

/**
 * Light / dark switch, the same control gateling.com has. Toggles from the
 * *resolved* theme so someone on "system" flips to the opposite of what
 * they currently see rather than to whatever `theme` happens to read.
 */
export function ThemeToggle(props: ComponentProps<typeof Button>) {
  const { t } = useTranslation();
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={t("themeToggle")}
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      {...props}
    >
      <Swap mode="dark" animation="rotate" forceTransition>
        <SwapOn>
          <SunIcon />
        </SwapOn>
        <SwapOff>
          <MoonIcon />
        </SwapOff>
      </Swap>
    </Button>
  );
}
