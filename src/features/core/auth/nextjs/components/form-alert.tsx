"use client";

import { AlertTriangleIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useTranslation } from "@/features/core/i18n/client";

export default function FormAlert({ message }: { message: string }) {
  const { t } = useTranslation();

  return (
    <Alert className="w-full" variant="destructive">
      <AlertTriangleIcon />
      <AlertTitle>{t("errors.generic")}</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
