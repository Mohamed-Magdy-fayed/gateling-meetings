import type { TRPC_ERROR_CODE_KEY } from "@trpc/server";

/**
 * Every REST failure is `{ error: { code, message, details? } }` with a
 * stable machine-readable `code` — the other system branches on that, never
 * on the (translated) message.
 */
export type ApiErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "validation_error"
  | "conflict"
  | "rate_limited"
  | "precondition_failed"
  | "internal_error";

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly details?: unknown;

  constructor(
    status: number,
    code: ApiErrorCode,
    message: string,
    details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/**
 * The service layer speaks `TRPCError`; this is the one place its codes turn
 * into HTTP. Anything unmapped is a 500 with a fixed message — the real
 * error is logged, never echoed to the caller.
 */
export function apiErrorFromTrpcCode(
  code: TRPC_ERROR_CODE_KEY,
  message: string,
): ApiError {
  switch (code) {
    case "BAD_REQUEST":
    case "PARSE_ERROR":
      return new ApiError(400, "validation_error", message);
    case "UNAUTHORIZED":
      return new ApiError(401, "unauthorized", message);
    case "FORBIDDEN":
      return new ApiError(403, "forbidden", message);
    case "NOT_FOUND":
      return new ApiError(404, "not_found", message);
    case "CONFLICT":
      return new ApiError(409, "conflict", message);
    case "PRECONDITION_FAILED":
      return new ApiError(412, "precondition_failed", message);
    case "TOO_MANY_REQUESTS":
      return new ApiError(429, "rate_limited", message);
    default:
      return new ApiError(500, "internal_error", "Internal error.");
  }
}
