"use client";

import type { ReactNode } from "react";

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { useTranslation } from "@/features/core/i18n/client";
import type { mainTranslations } from "@/features/core/i18n/global";
import type { TranslationKey } from "@/features/core/i18n/lib";
import { useFieldContext } from "./hooks";
import {
  extractValidationErrorMessage,
  flattenValidationErrors,
  translateFormErrorMessage,
} from "./validation-messages";

export type FormFieldProps = {
  label: string;
  description?: string;
  autoFocus?: boolean;
  disabled?: boolean;
};

type FormBaseProps = FormFieldProps & {
  children: ReactNode;
  controlFirst?: boolean;
};

export function FormBase({
  children,
  label,
  description,
  controlFirst,
  disabled,
}: FormBaseProps) {
  const field = useFieldContext();
  const { t, locale } = useTranslation();
  const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
  const translateErrorMessage = (message?: string) =>
    translateFormErrorMessage(
      (key) => t(key as TranslationKey<typeof mainTranslations>, {}),
      message,
      {
        locale,
        fallbackLocale: "en",
      },
    );

  const errors = flattenValidationErrors(field.state.meta.errors)
    .map((entry) => extractValidationErrorMessage(entry))
    .filter((message): message is string => Boolean(message))
    .map((message) => ({ message: translateErrorMessage(message) }));

  const labelElement = (
    <>
      <FieldLabel htmlFor={field.name}>{label}</FieldLabel>
      {description && <FieldDescription>{description}</FieldDescription>}
    </>
  );

  const errorElement = isInvalid && <FieldError errors={errors} />;

  if (controlFirst) {
    return (
      <Field data-invalid={isInvalid} orientation="horizontal">
        {children}
        <FieldContent>
          {labelElement}
          {errorElement}
        </FieldContent>
      </Field>
    );
  }

  return (
    <Field data-invalid={isInvalid} data-disabled={disabled}>
      {labelElement}
      {children}
      {errorElement}
    </Field>
  );
}
