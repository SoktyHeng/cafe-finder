import { z } from "zod";

/** Error contract shared by every API route (CLAUDE.md §10.5). */

export const API_ERROR_STATUS = {
  VALIDATION_ERROR: 400,
  AUTH_REQUIRED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
  UPSTREAM_UNAVAILABLE: 503,
} as const;

export type ApiErrorCode = keyof typeof API_ERROR_STATUS;

const API_ERROR_CODES = Object.keys(API_ERROR_STATUS) as [
  ApiErrorCode,
  ...ApiErrorCode[],
];

export const apiErrorBodySchema = z.object({
  error: z.object({
    code: z.enum(API_ERROR_CODES),
    message: z.string(),
  }),
});

export type ApiErrorBody = z.infer<typeof apiErrorBodySchema>;

/**
 * Builds an error response. `message` must be safe for end users. Never pass
 * vendor payloads, keys or stack traces.
 */
export function apiError(
  code: ApiErrorCode,
  message: string,
  headers: Record<string, string> = {},
): Response {
  const body: ApiErrorBody = { error: { code, message } };
  return Response.json(body, {
    status: API_ERROR_STATUS[code],
    headers: { "Cache-Control": "no-store", ...headers },
  });
}

/** Safe public message for any upstream/provider outage. */
export const UPSTREAM_UNAVAILABLE_MESSAGE =
  "Cafe search is temporarily unavailable. Please try again later.";
