"use client";

import { Input } from "@/components/ui/input";
import { FormBase, type FormFieldProps } from "./form-base";
import { useFieldContext } from "./hooks";

/**
 * A wall-clock date + time (`YYYY-MM-DDTHH:mm`, no zone) via the browser's
 * native picker — the field's value is the string the input produces; the
 * form combines it with a separately chosen time zone into an instant on
 * submit. Native because every platform's picker beats a custom one on a
 * phone, and a meeting is scheduled from a phone as often as not.
 */
export function FormDateTimeField({
  min,
  disabled,
  autoFocus,
  ...props
}: FormFieldProps & { min?: string }) {
  const field = useFieldContext<string>();
  const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;

  return (
    <FormBase {...props} disabled={disabled}>
      <Input
        aria-invalid={isInvalid}
        autoFocus={autoFocus}
        disabled={disabled}
        id={field.name}
        min={min}
        name={field.name}
        onBlur={field.handleBlur}
        onChange={(e) => field.handleChange(e.target.value)}
        type="datetime-local"
        value={field.state.value ?? ""}
      />
    </FormBase>
  );
}
