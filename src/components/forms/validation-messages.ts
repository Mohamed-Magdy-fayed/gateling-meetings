import { mainTranslations } from "@/features/core/i18n/global";

function lookupTranslationKey(
  locale: string,
  fallbackLocale: string,
  key: string,
): string | undefined {
  const localesToTry = new Set([locale, fallbackLocale]);
  for (const loc of localesToTry) {
    const langFile = mainTranslations[loc as keyof typeof mainTranslations];
    if (!langFile) continue;
    let value: unknown = langFile;
    for (const part of key.split(".")) {
      if (value === undefined || typeof value !== "object" || value === null) {
        value = undefined;
        break;
      }
      value = (value as Record<string, unknown>)[part];
    }
    if (typeof value === "string") return value;
    if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  }
  return undefined;
}

/** Flatten TanStack field `meta.errors` (issues may be nested one level). */
export function flattenValidationErrors(errors: unknown[]): unknown[] {
  return errors.flatMap((error) => (Array.isArray(error) ? error : [error]));
}

/** Read a user-facing message from a validator issue (Zod 4 / Standard Schema). */
export function extractValidationErrorMessage(
  error: unknown,
): string | undefined {
  if (typeof error === "string") return error;
  if (Array.isArray(error)) {
    const parts = error
      .map(extractValidationErrorMessage)
      .filter((m): m is string => Boolean(m));
    return parts.length > 0 ? parts.join("\n") : undefined;
  }
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    if (Array.isArray(record.issues) && record.issues.length > 0) {
      const parts = record.issues
        .map(extractValidationErrorMessage)
        .filter((m): m is string => Boolean(m));
      return parts.length > 0 ? parts.join("\n") : undefined;
    }
    if (typeof record.message === "string") {
      if (!record.message.startsWith("[") && !record.message.startsWith("{")) {
        return record.message;
      }
    }
    if (typeof record.error === "string") return record.error;
  }
  return undefined;
}

/**
 * Turn a Zod / validator `message` into user-visible text. Dotted keys are passed
 * through the active locale `t` function; anything else is returned verbatim.
 */
export function translateFormErrorMessage(
  t: (key: string) => string,
  message?: string,
  options?: { locale?: string; fallbackLocale?: string },
): string | undefined {
  if (!message) {
    return message;
  }
  try {
    const translated = t(message);
    if (translated !== message) {
      return translated;
    }
    if (options?.locale) {
      return (
        lookupTranslationKey(
          options.locale,
          options.fallbackLocale ?? "en",
          message,
        ) ?? translated
      );
    }
    return translated;
  } catch {
    if (options?.locale) {
      return lookupTranslationKey(
        options.locale,
        options.fallbackLocale ?? "en",
        message,
      );
    }
    return message;
  }
}

export function translateZodIssueMessages(
  t: (key: string) => string,
  issues: Array<{ message?: string }>,
  options?: { locale?: string; fallbackLocale?: string },
): string {
  return issues
    .map((i) => translateFormErrorMessage(t, i.message, options))
    .filter((m): m is string => Boolean(m && m.length > 0))
    .join("\n");
}
