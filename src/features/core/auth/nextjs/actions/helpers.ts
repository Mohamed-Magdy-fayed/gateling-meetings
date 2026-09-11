import type z from "zod";

import { getT } from "@/features/core/i18n/server";

export async function validateInput<T>(
  schema: z.ZodSchema<T>,
  input: unknown,
): Promise<T> {
  const { t } = await getT();
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new Error(t("auth.error.badRequest"));
  }

  return parsed.data;
}
