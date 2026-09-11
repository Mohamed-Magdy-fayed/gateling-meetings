import { createFormHook, createFormHookContexts } from "@tanstack/react-form";
import { toast } from "sonner";

import {
  extractValidationErrorMessage,
  flattenValidationErrors,
  translateFormErrorMessage,
} from "@/components/forms/validation-messages";
import { useTranslation } from "@/features/core/i18n/client";
import { FormBooleanField } from "./boolean-field";
import { FormComboboxOneField } from "./combobox-one-field";
// DateField, DateTimeField land with react-day-picker in Phase 5 (calendar UI, docs/rebuild/02-dependencies.md).
// import { FormDateField } from "./date-field";
// import { FormDateTimeField } from "./date-time-field";
import { FormEmailField } from "./email-field";
// MobileField needs react-phone-number-input, not yet an approved dependency — revisit when a phase needs it.
// import { FormMobileField } from "./mobile-field";
import { FormNumberField } from "./number-field";
import { FormPasswordField } from "./password-field";
// import { FormSearchLookupField } from "./search-lookup-field";
import { FormSelectField } from "./select-field";
import { FormStringField } from "./string-field";
import { FormTextareaField } from "./textarea-field";

const { fieldContext, formContext, useFieldContext, useFormContext } =
  createFormHookContexts();

const { useAppForm: useAppFormBase } = createFormHook({
  fieldComponents: {
    StringField: FormStringField,
    NumberField: FormNumberField,
    EmailField: FormEmailField,
    PasswordField: FormPasswordField,
    // MobileField: FormMobileField,
    ComboboxOneField: FormComboboxOneField,
    SelectField: FormSelectField,
    // DateField: FormDateField,
    // DateTimeField: FormDateTimeField,
    BooleanField: FormBooleanField,
    TextareaField: FormTextareaField,
    // SearchLookupField: FormSearchLookupField,
  },
  formComponents: {},
  fieldContext,
  formContext,
});

const useAppForm: typeof useAppFormBase = (opts) => {
  const { t, locale } = useTranslation();

  return useAppFormBase({
    ...opts,
    onSubmitInvalid: (props) => {
      const { formApi } = props;
      for (const fieldName of Object.keys(formApi.state.fieldMeta)) {
        const meta = formApi.getFieldMeta(
          fieldName as keyof typeof formApi.state.fieldMeta,
        );
        if (meta?.errors && meta.errors.length > 0) {
          formApi.setFieldMeta(
            fieldName as keyof typeof formApi.state.fieldMeta,
            (prev) => ({ ...prev, isTouched: true }),
          );
        }
      }
      opts.onSubmitInvalid?.(props);
      const errors = flattenValidationErrors(
        Object.values(formApi.state.fieldMeta).flatMap((meta) => {
          const fieldMeta = meta as { errors?: unknown[] } | undefined;
          return fieldMeta?.errors ?? [];
        }),
      );
      if (errors.length > 0) {
        const message = errors
          .map((e) => {
            const raw = extractValidationErrorMessage(e);
            return raw
              ? translateFormErrorMessage((key) => t(key as never), raw, {
                  locale,
                  fallbackLocale: "en",
                })
              : undefined;
          })
          .filter(Boolean)
          .join("\n");
        if (message) toast.error(message);
      }
    },
  });
};

export { useAppForm, useFieldContext, useFormContext };
