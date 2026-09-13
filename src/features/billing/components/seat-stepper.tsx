"use client";

import { MinusIcon, PlusIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@/features/core/i18n/client";

const MAX_SEATS = 500;

type SeatStepperProps = {
  value: number;
  /** Cannot go below the members already in the org. */
  min: number;
  onChange: (value: number) => void;
};

export function SeatStepper({ value, min, onChange }: SeatStepperProps) {
  const { t } = useTranslation();
  const clamp = (n: number) => Math.min(MAX_SEATS, Math.max(min, n));
  return (
    <div className="flex items-center gap-3">
      <Label htmlFor="seats" className="text-sm">
        {t("billing.settings.seats")}
      </Label>
      <div className="flex items-center gap-1">
        <Button
          size="icon"
          variant="outline"
          aria-label={t("billing.settings.fewerSeats")}
          disabled={value <= min}
          onClick={() => onChange(clamp(value - 1))}
        >
          <MinusIcon />
        </Button>
        <Input
          id="seats"
          type="number"
          className="w-20 text-center"
          min={min}
          max={MAX_SEATS}
          value={value}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (!Number.isNaN(next)) onChange(clamp(next));
          }}
        />
        <Button
          size="icon"
          variant="outline"
          aria-label={t("billing.settings.moreSeats")}
          disabled={value >= MAX_SEATS}
          onClick={() => onChange(clamp(value + 1))}
        >
          <PlusIcon />
        </Button>
      </div>
    </div>
  );
}
