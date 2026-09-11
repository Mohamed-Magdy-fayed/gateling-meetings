"use client";

import { useCallback, useMemo } from "react";

import { SelectManyField } from "@/components/general/select-field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormBase, type FormFieldProps } from "./form-base";
import { useFieldContext } from "./hooks";

type SelectOption = {
  value: string;
  label: string;
};

type FormSelectFieldProps = FormFieldProps & {
  options: SelectOption[];
  placeholder?: string;
  multiple?: boolean;
};

export function FormSelectField({
  options,
  placeholder,
  multiple,
  disabled,
  ...props
}: FormSelectFieldProps) {
  const field = useFieldContext();
  const stateValue = field.state.value;
  const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;

  const setSingleValue = useCallback(
    (val: string | null) => field.handleChange(val ?? ""),
    [field.handleChange],
  );

  const setMultipleValue = useCallback(
    (val: string[] | null) => field.handleChange(val ?? []),
    [field.handleChange],
  );

  const matchedMultiple = useMemo(() => {
    if (!multiple) return [];
    const arr = (stateValue as string[]) ?? [];
    return arr
      .map((v) => options.find((o) => o.value === v))
      .filter((o): o is SelectOption => Boolean(o));
  }, [multiple, stateValue, options]);

  if (multiple) {
    return (
      <FormBase {...props} disabled={disabled}>
        <SelectManyField
          disabled={disabled}
          options={options}
          placeholder={placeholder}
          setValue={(val) => setMultipleValue(val.map((item) => item.value))}
          value={matchedMultiple}
        />
      </FormBase>
    );
  }

  const currentValue = (stateValue as string) || null;

  return (
    <FormBase {...props} disabled={disabled}>
      <Select
        disabled={disabled}
        value={currentValue}
        onValueChange={(val) => setSingleValue((val as string) ?? null)}
      >
        <SelectTrigger
          id={field.name}
          aria-invalid={isInvalid}
          className="w-full"
        >
          {/*
           * Base-UI's SelectValue does not auto-derive a label from
           * the selected SelectItem's children; without this mapper
           * it would render the raw `value` (e.g. "customer") and
           * appear untranslated. Resolve the matching option label
           * for the active value here.
           */}
          <SelectValue placeholder={placeholder}>
            {(val) =>
              options.find((o) => o.value === (val as string))?.label ??
              placeholder ??
              ""
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FormBase>
  );
}
