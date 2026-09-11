"use client";

import { useRouter } from "next/navigation";
import {
  type ComponentProps,
  createContext,
  type ReactNode,
  useContext,
  useMemo,
  useState,
  useTransition,
} from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Swap, SwapOff, SwapOn } from "@/components/ui/swap";
import { mainTranslations } from "@/features/core/i18n/global";
import { setLocaleCookie } from "@/features/core/i18n/server";
import { cn } from "@/lib/utils";
import { createI18n, type LanguageMessages, LOCALE_COOKIE_NAME } from "./lib";

type TranslationContextValue = {
  locale: string;
  dir: "rtl" | "ltr";
  setLocale: (locale: string) => void;
  fallbackLocale: string;
};

const TranslationContext = createContext<TranslationContextValue | null>(null);

export function TranslationProvider({
  defaultLocale = "en",
  fallbackLocale = "en",
  children,
}: {
  fallbackLocale?: string;
  defaultLocale?: string;
  children: ReactNode;
}) {
  const [locale, setLocale] = useState(defaultLocale);
  const dir = useMemo(() => (locale === "ar" ? "rtl" : "ltr"), [locale]);

  return (
    <TranslationContext.Provider
      value={{ locale, setLocale, fallbackLocale, dir }}
    >
      {children}
    </TranslationContext.Provider>
  );
}

export function useTranslation<
  const T extends Record<string, LanguageMessages>,
>(translations?: T) {
  const router = useRouter();
  const context = useContext(TranslationContext);
  if (!context) {
    throw new Error("useTranslation must be used within a LocaleProvider");
  }

  const { t } = useMemo(
    () =>
      createI18n(
        translations || mainTranslations,
        context.locale,
        context.fallbackLocale,
      ),
    [translations, context.locale, context.fallbackLocale],
  );

  const [isPending, startTransition] = useTransition();

  const setLocale = (newLocale: string) => {
    const newDir = newLocale === "ar" ? "rtl" : "ltr";
    document.dir = newDir;
    document.documentElement.setAttribute("dir", newDir);
    context.setLocale(newLocale);
    const secureAttribute =
      process.env.NODE_ENV === "production" ? "; secure" : "";
    document.cookie = `${LOCALE_COOKIE_NAME}=${encodeURIComponent(newLocale)}; path=/; samesite=lax${secureAttribute}`;

    startTransition(() => {
      void setLocaleCookie(newLocale).then(() => {
        router.refresh();
      });
    });
  };

  return {
    isPending,
    locale: context.locale,
    dir: context.dir,
    setLocale,
    t,
  };
}

export function LanguageToggle({
  className,
  ...props
}: ComponentProps<typeof Button>) {
  const { locale, setLocale, t } = useTranslation();

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={t("languageToggle")}
      className={cn(
        "cursor-pointer hover:bg-accent! hover:text-accent-foreground! transition-all duration-300",
        className,
      )}
      onClick={() => setLocale(locale === "ar" ? "en" : "ar")}
      {...props}
    >
      <Swap mode="rtl" animation="flip">
        <SwapOn>EN</SwapOn>
        <SwapOff>AR</SwapOff>
      </Swap>
    </Button>
  );
}
