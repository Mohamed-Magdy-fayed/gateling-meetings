import { DrizzleError } from "drizzle-orm";

import type { TypedResponse } from "@/features/core/auth/types";

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function getInitials(name: string) {
  const names = name.trim().split(" ");
  if (names.length === 0) return "";
  if (names.length === 1) return names[0]?.charAt(0).toUpperCase();
  return `${names[0]?.charAt(0).toUpperCase()}${names[names.length - 1]?.charAt(0).toUpperCase()}`;
}

export function authError(error: unknown): TypedResponse<never> {
  const message =
    error instanceof Error
      ? error.message
      : error instanceof DrizzleError
        ? error.message
        : "Unknown error";

  return { isError: true, message };
}
