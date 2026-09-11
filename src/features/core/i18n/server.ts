"use server";

import { cookies } from "next/headers";

import { mainTranslations } from "@/features/core/i18n/global";
import { createI18n, LOCALE_COOKIE_NAME } from "@/features/core/i18n/lib";

const SUPPORTED_LOCALES = Object.keys(mainTranslations);

function isSupportedLocale(locale: string): boolean {
  return SUPPORTED_LOCALES.includes(locale);
}

export async function getT() {
  const cookieStore = await cookies();
  const locale = cookieStore.get(LOCALE_COOKIE_NAME)?.value || "en";
  return createI18n(mainTranslations, locale, "en");
}

export async function setLocaleCookie(locale: string) {
  if (!isSupportedLocale(locale)) {
    return;
  }

  const cookieStore = await cookies();
  cookieStore.set(LOCALE_COOKIE_NAME, locale, {
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}

export async function getLocaleCookie() {
  const cookieStore = await cookies();
  const locale = cookieStore.get(LOCALE_COOKIE_NAME)?.value;
  return locale && isSupportedLocale(locale) ? locale : "en";
}
