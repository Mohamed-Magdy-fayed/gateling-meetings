import { TRPCError } from "@trpc/server";
import { DrizzleQueryError } from "drizzle-orm";
import type { PostgresError } from "postgres";

// Relevant Postgres error codes (see: https://www.postgresql.org/docs/current/errcodes-appendix.html)
export enum OPSTATUS {
  SUCCESS = 0,
  FOREIGN_KEY_VIOLATION = 23503,
  UNIQUE_VIOLATION = 23505,
  CHECK_VIOLATION = 23514,
  NOT_NULL_VIOLATION = 23502,
  INVALID_TRANSACTION_STATE = 25000,
  CONNECTION_DOES_NOT_EXIST = 8003,
  CONNECTION_FAILURE = 8006,
  UNKNOWN_FAILURE = -1,
}

export function handleDatabaseError(err: unknown): TRPCError {
  if (err instanceof DrizzleQueryError) {
    const cause = err.cause as PostgresError;
    const errCode = Number(cause.code);

    // cause.detail can contain raw column values (e.g. the conflicting email
    // address) — log it server-side only, never in the client-facing message.
    if (cause.detail) {
      console.error("Database error detail:", cause.detail);
    }

    switch (errCode) {
      case OPSTATUS.UNIQUE_VIOLATION:
        return new TRPCError({
          code: "CONFLICT",
          message: "Unique constraint violation",
        });
      case OPSTATUS.FOREIGN_KEY_VIOLATION:
        return new TRPCError({
          code: "BAD_REQUEST",
          message: "Foreign key constraint violation",
        });
      case OPSTATUS.NOT_NULL_VIOLATION:
        return new TRPCError({
          code: "BAD_REQUEST",
          message: "Not-null constraint violation",
        });
      case OPSTATUS.CHECK_VIOLATION:
        return new TRPCError({
          code: "BAD_REQUEST",
          message: "Check constraint violation",
        });
      case OPSTATUS.INVALID_TRANSACTION_STATE:
        return new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Invalid transaction state",
        });
      case OPSTATUS.CONNECTION_FAILURE:
      case OPSTATUS.CONNECTION_DOES_NOT_EXIST:
        return new TRPCError({
          code: "SERVICE_UNAVAILABLE",
          message: "Connection failure to the database server",
        });
      default:
        return new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Unknown database error",
        });
    }
  }

  return new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: "Unknown error",
  });
}
