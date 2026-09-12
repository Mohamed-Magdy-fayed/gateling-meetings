import { ApiError } from "./errors";

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

export function jsonResponse(
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { ...JSON_HEADERS, ...init.headers },
  });
}

export function errorResponse(error: ApiError): Response {
  return jsonResponse(
    {
      error: {
        code: error.code,
        message: error.message,
        ...(error.details !== undefined ? { details: error.details } : {}),
      },
    },
    {
      status: error.status,
      headers:
        error.status === 401 ? { "www-authenticate": "Bearer" } : undefined,
    },
  );
}

/** One fixed message for every "not yours / not there" — no enumeration. */
export const meetingNotFound = () =>
  new ApiError(404, "not_found", "No such meeting.");
