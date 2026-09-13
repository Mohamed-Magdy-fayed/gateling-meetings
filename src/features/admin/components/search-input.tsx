"use client";

import { SearchIcon } from "lucide-react";

import { Input } from "@/components/ui/input";
import { useTranslation } from "@/features/core/i18n/client";

type SearchInputProps = { value: string; onChange: (value: string) => void };

export function SearchInput({ value, onChange }: SearchInputProps) {
  const { t } = useTranslation();
  return (
    <div className="relative max-w-sm">
      <SearchIcon className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-muted-foreground" />
      <Input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={t("admin.search")}
        className="ps-9"
      />
    </div>
  );
}
