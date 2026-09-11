"use client";

import { useCallback, useMemo } from "react";

import { SelectOneField } from "@/components/general/select-field";

import { FormBase, type FormFieldProps } from "./form-base";
import { useFieldContext } from "./hooks";

type SelectOption = {
  value: string;
  label: string;
};

type FormComboboxOneFieldProps = FormFieldProps & {
  options: SelectOption[];
  placeholder?: string;
};

export function FormComboboxOneField({
  options,
  placeholder,
  disabled,
  ...props
}: FormComboboxOneFieldProps) {
  const field = useFieldContext<string>();

  const selected = useMemo(
    () => options.find((o) => o.value === field.state.value) ?? null,
    [options, field.state.value],
  );

  const setValue = useCallback(
    (opt: SelectOption | null) => {
      field.handleChange(opt?.value ?? "");
    },
    [field],
  );

  return (
    <FormBase {...props} disabled={disabled}>
      <SelectOneField
        disabled={disabled}
        options={options}
        placeholder={placeholder}
        setValue={setValue}
        value={selected}
      />
    </FormBase>
  );
}
