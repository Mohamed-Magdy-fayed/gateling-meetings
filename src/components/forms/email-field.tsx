"use client";

import { MailIcon } from "lucide-react";

import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { FormBase, type FormFieldProps } from "./form-base";
import { useFieldContext } from "./hooks";

export function FormEmailField({
  placeholder,
  autoFocus,
  disabled,
  ...props
}: FormFieldProps & { placeholder?: string }) {
  const field = useFieldContext<string>();
  const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;

  return (
    <FormBase {...props}>
      <InputGroup>
        <InputGroupInput
          aria-invalid={isInvalid}
          autoComplete="email"
          autoFocus={autoFocus}
          disabled={disabled}
          id={field.name}
          name={field.name}
          onBlur={field.handleBlur}
          onChange={(e) => field.handleChange(e.target.value)}
          placeholder={placeholder}
          type="email"
          value={field.state.value ?? ""}
        />
        <InputGroupAddon align="inline-end">
          <MailIcon />
        </InputGroupAddon>
      </InputGroup>
    </FormBase>
  );
}
