"use client";

import { ArrowRightIcon, KeyboardIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, type RefObject, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { useTranslation } from "@/features/core/i18n/client";
import { normalizeMeetingCode } from "@/features/meetings/lib/meeting-code";
import { cn } from "@/lib/utils";

type JoinByCodeFormProps = {
  className?: string;
  /** Lets a host (the phone "Join" sheet) move focus into the field on open. */
  inputRef?: RefObject<HTMLInputElement | null>;
};

/** "Enter a code or link" — accepts anything `normalizeMeetingCode` understands. */
export function JoinByCodeForm({ className, inputRef }: JoinByCodeFormProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const [value, setValue] = useState("");
  const [isInvalid, setIsInvalid] = useState(false);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const code = normalizeMeetingCode(value);
    if (!code) {
      setIsInvalid(true);
      return;
    }
    router.push(`/m/${code}`);
  }

  return (
    <form
      onSubmit={onSubmit}
      className={cn("flex w-full items-stretch gap-2", className)}
    >
      <InputGroup className="h-10 flex-1">
        <InputGroupAddon>
          <KeyboardIcon />
        </InputGroupAddon>
        <InputGroupInput
          ref={inputRef}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setIsInvalid(false);
          }}
          placeholder={t("meetings.home.joinPlaceholder")}
          aria-label={t("meetings.home.joinPlaceholder")}
          aria-invalid={isInvalid || undefined}
          autoComplete="off"
          spellCheck={false}
          className="font-mono tracking-wide"
        />
      </InputGroup>
      <Button type="submit" size="lg" variant="outline" className="h-10">
        {t("meetings.home.join")}
        <ArrowRightIcon data-icon="inline-end" className="rtl:-scale-x-100" />
      </Button>
    </form>
  );
}
