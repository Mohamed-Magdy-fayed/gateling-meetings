"use client";

import type { ComponentProps } from "react";

import { Input } from "@/components/ui/input";
import { FormBase, type FormFieldProps } from "./form-base";
import { useFieldContext } from "./hooks";

/**
 * Phone numbers, addresses and URLs read left to right in every locale;
 * without this, Arabic pages render "+20" as "20+".
 */
const LTR_INPUT_TYPES = new Set(["tel", "email", "url"]);

export function FormStringField({
  placeholder,
  autoFocus,
  inputType,
  disabled,
  ...props
}: FormFieldProps & {
  placeholder?: string;
  inputType?: ComponentProps<typeof Input>["type"];
  disabled?: boolean;
}) {
  const field = useFieldContext<string>();
  const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;

  return (
    <FormBase {...props}>
      <Input
        aria-invalid={isInvalid}
        autoComplete="off"
        autoFocus={autoFocus}
        dir={inputType && LTR_INPUT_TYPES.has(inputType) ? "ltr" : undefined}
        disabled={disabled}
        id={field.name}
        name={field.name}
        onBlur={field.handleBlur}
        onChange={(e) => field.handleChange(e.target.value)}
        placeholder={placeholder}
        type={inputType}
        value={field.state.value ?? ""}
      />
    </FormBase>
  );
}
