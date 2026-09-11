"use client";

import { Textarea } from "@/components/ui/textarea";
import { FormBase, type FormFieldProps } from "./form-base";
import { useFieldContext } from "./hooks";

export function FormTextareaField({
  placeholder,
  rows = 4,
  disabled,
  ...props
}: FormFieldProps & { placeholder?: string; rows?: number }) {
  const field = useFieldContext<string>();
  const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;

  return (
    <FormBase {...props} disabled={disabled}>
      <Textarea
        aria-invalid={isInvalid}
        disabled={disabled}
        id={field.name}
        name={field.name}
        onBlur={field.handleBlur}
        onChange={(e) => field.handleChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        value={field.state.value ?? ""}
      />
    </FormBase>
  );
}
