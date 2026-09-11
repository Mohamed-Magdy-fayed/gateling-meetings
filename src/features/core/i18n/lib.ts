export const LOCALE_COOKIE_NAME = "NEXT_LOCALE"; // Change if needed

export type ParamOptions = {
  date?: Record<string, Intl.DateTimeFormatOptions>;
  number?: Record<string, Intl.NumberFormatOptions>;
  plural?: Record<
    string,
    Partial<Record<Exclude<Intl.LDMLPluralRule, "other">, string>> & {
      other: string;
      formatter?: Intl.NumberFormatOptions;
      type?: Intl.PluralRuleType;
    }
  >;
  enum?: Record<string, Record<string, string>>;
  list?: Record<string, Intl.ListFormatOptions>;
};

type ParseOptionType<
  ParamType extends string,
  ParamName extends string,
> = ParamType extends "number"
  ? { number?: { [K in ParamName]?: Intl.NumberFormatOptions } }
  : ParamType extends "plural"
    ? {
        plural: {
          [K in ParamName]: Partial<
            Record<Exclude<Intl.LDMLPluralRule, "other">, string>
          > & {
            other: string;
            formatter?: Intl.NumberFormatOptions;
            type?: Intl.PluralRuleType;
          };
        };
      }
    : ParamType extends "date"
      ? { date?: { [K in ParamName]?: Intl.DateTimeFormatOptions } }
      : ParamType extends "list"
        ? { list?: { [K in ParamName]?: Intl.ListFormatOptions } }
        : ParamType extends "enum"
          ? { enum: { [K in ParamName]: Record<string, string> } }
          : never;

type ExtractParamOptions<S extends string> =
  S extends `${string}{${infer Param}}${infer Rest}`
    ? Param extends `${infer Name}:${infer Type}`
      ? ParseOptionType<Type, Name> & ExtractParamOptions<Rest>
      : ExtractParamOptions<Rest>
    : unknown;

export function defineTranslation<
  S extends string,
  O extends ExtractParamOptions<S>,
>(string: S, options: O): [S, O] {
  return [string, options];
}

export { defineTranslation as dt };

export type I18nMessage = string | ReturnType<typeof defineTranslation>;
export type LanguageMessages = {
  [key: string]: I18nMessage | LanguageMessages;
};

// All the type helpers for creating the argument map are correct.
type Paths<T> = T extends object
  ? {
      [K in keyof T & string]: T[K] extends I18nMessage
        ? K
        : `${K}.${Paths<T[K]>}`;
    }[keyof T & string]
  : never;
type TypeAtPath<T, P extends string> = P extends `${infer K}.${infer R}`
  ? K extends keyof T
    ? TypeAtPath<T[K], R>
    : never
  : P extends keyof T
    ? T[P]
    : never;
type ParseArgType<
  ParamType extends string,
  ParamName extends string,
  Options,
> = ParamType extends "number" | "plural"
  ? number
  : ParamType extends "date"
    ? Date
    : ParamType extends "list"
      ? string[]
      : ParamType extends "enum"
        ? Options extends { enum: { [K in ParamName]: infer E } }
          ? keyof E
          : string
        : string;
type ExtractArgs<
  S extends string,
  Options,
> = S extends `${string}{${infer Param}}${infer Rest}`
  ? (Param extends `${infer Name}:${infer Type}`
      ? { [K in Name]: ParseArgType<Type, Name, Options> }
      : { [K in Param]: string }) &
      ExtractArgs<Rest, Options>
  : {};
type ArgsMap<T extends object> = {
  [P in Paths<T>]: TypeAtPath<T, P> extends [infer S, infer O]
    ? S extends string
      ? ExtractArgs<S, O>
      : {}
    : TypeAtPath<T, P> extends string
      ? ExtractArgs<TypeAtPath<T, P>, {}>
      : {};
} & {};
type MergedArgsMap<T extends Record<string, LanguageMessages>> = {
  [K in keyof T]: ArgsMap<T[K]>;
}[keyof T];

export type TFunction<T extends Record<string, LanguageMessages>> = <
  P extends keyof MergedArgsMap<T> & string,
>(
  key: P,
  ...args: MergedArgsMap<T>[P] extends Record<string, never>
    ? []
    : [MergedArgsMap<T>[P]]
) => string;
export type TranslationKey<T extends Record<string, LanguageMessages>> =
  Parameters<TFunction<T>>[0];

// The factory function that creates the i18n instance.
export function createI18n<const T extends Record<string, LanguageMessages>>(
  translations: T,
  locale: string,
  fallbackLocale: string,
) {
  const t = (key: string, args?: Record<string, any>): string => {
    const localesToTry = new Set([
      locale,
      ...getOrderedLocaleAndParentLocales(locale),
      fallbackLocale,
    ]);
    for (const loc of localesToTry) {
      const langFile = translations[loc.toLowerCase()];
      if (!langFile) continue;
      let value: any = langFile;
      for (const part of key.split(".")) {
        if (
          value === undefined ||
          typeof value !== "object" ||
          value === null
        ) {
          value = undefined;
          break;
        }
        value = value[part];
      }
      if (value === undefined) continue;
      try {
        if (typeof value === "string")
          return performSubstitution(loc, value, args ?? {}, {});
        if (Array.isArray(value))
          return performSubstitution(
            loc,
            value[0],
            args ?? {},
            value[1] as ParamOptions,
          );
      } catch {}
    }
    return key;
  };

  return { t: t as TFunction<T> };
}

function getOrderedLocaleAndParentLocales(locale: string) {
  const locales: string[] = [];
  let current = locale;
  while (current) {
    const lastDash = current.lastIndexOf("-");
    if (lastDash > 0) {
      current = current.substring(0, lastDash);
      locales.push(current);
    } else {
      break;
    }
  }
  return locales;
}

function performSubstitution(
  locale: string,
  str: string,
  args: Record<string, unknown>,
  params: ParamOptions,
): string {
  return Object.entries(args).reduce((result, [argKey, argValue]) => {
    const match = result.match(`{${argKey}:?([^}]*)?}`);
    const [replaceKey, argType] = match ? match : [`{${argKey}}`, undefined];
    switch (argType) {
      case "plural": {
        if (typeof argValue !== "number")
          throw new Error(
            `Invalid argument for plural: expected number, got ${typeof argValue}`,
          );
        const pluralMap = params.plural?.[argKey];
        if (!pluralMap) return result;
        const pluralRules = new Intl.PluralRules(locale, {
          type: pluralMap?.type,
        });
        const replacement =
          pluralMap?.[pluralRules.select(argValue)] ?? pluralMap?.other;
        if (replacement == null)
          throw new Error("Missing replacement value for plural");
        const numberFormatter = new Intl.NumberFormat(
          locale,
          params.plural?.[argKey]?.formatter,
        );
        return result.replaceAll(
          replaceKey,
          replacement.replaceAll("{?}", numberFormatter.format(argValue)),
        );
      }
      case "enum": {
        if (typeof argValue !== "string")
          throw new Error(
            `Invalid argument for enum: expected string, got ${typeof argValue}`,
          );
        const enumMap = params.enum?.[argKey];
        const replacement = enumMap?.[argValue];
        if (replacement == null)
          throw new Error(
            `Missing replacement value for enum key "${argValue}"`,
          );
        return result.replaceAll(replaceKey, replacement);
      }
      case "number": {
        if (typeof argValue !== "number")
          throw new Error(
            `Invalid argument for number: expected number, got ${typeof argValue}`,
          );
        const numberFormat = new Intl.NumberFormat(
          locale,
          params.number?.[argKey],
        );
        return result.replaceAll(replaceKey, numberFormat.format(argValue));
      }
      case "date": {
        if (!(argValue instanceof Date))
          throw new Error(
            `Invalid argument for date: expected Date object, got ${typeof argValue}`,
          );
        const dateFormat = new Intl.DateTimeFormat(
          locale,
          params.date?.[argKey],
        );
        return result.replaceAll(replaceKey, dateFormat.format(argValue));
      }
      case "list": {
        if (!Array.isArray(argValue))
          throw new Error(
            `Invalid argument for list: expected array, got ${typeof argValue}`,
          );
        const formatter = new Intl.ListFormat(locale, params.list?.[argKey]);
        return result.replaceAll(replaceKey, formatter.format(argValue));
      }
      default:
        return result.replaceAll(replaceKey, String(argValue));
    }
  }, str);
}
