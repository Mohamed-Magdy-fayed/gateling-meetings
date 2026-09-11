"use client";

import { EyeIcon, EyeOffIcon } from "lucide-react";
import type { ComponentProps } from "react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { FormBase, type FormFieldProps } from "./form-base";
import { useFieldContext } from "./hooks";

export function FormPasswordField({
  placeholder,
  autoFocus,
  disabled,
  autoComplete = "new-password",
  ...props
}: FormFieldProps & {
  placeholder?: string;
  autoComplete?: ComponentProps<typeof InputGroupInput>["autoComplete"];
}) {
  const field = useFieldContext<string>();
  const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
  const [visible, setVisible] = useState(false);

  return (
    <FormBase {...props} disabled={disabled}>
      <InputGroup>
        <InputGroupInput
          aria-invalid={isInvalid}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          disabled={disabled}
          id={field.name}
          name={field.name}
          onBlur={field.handleBlur}
          onChange={(e) => field.handleChange(e.target.value)}
          placeholder={placeholder}
          type={visible ? "text" : "password"}
          value={field.state.value ?? ""}
        />
        <InputGroupAddon align="inline-end">
          <Button
            aria-label={visible ? "Hide password" : "Show password"}
            disabled={disabled}
            onClick={() => setVisible((v) => !v)}
            size="icon"
            type="button"
            variant="ghost"
          >
            {visible ? <EyeOffIcon /> : <EyeIcon />}
          </Button>
        </InputGroupAddon>
      </InputGroup>
    </FormBase>
  );
}
