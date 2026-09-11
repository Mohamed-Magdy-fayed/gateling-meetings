import ar from "@/features/core/i18n/global/ar";
import en from "@/features/core/i18n/global/en";
import type { TranslationKey } from "@/features/core/i18n/lib";

export const mainTranslations = { en, ar };

export function translationKey<
  T extends TranslationKey<typeof mainTranslations>,
>(key: T): T {
  return key;
}
