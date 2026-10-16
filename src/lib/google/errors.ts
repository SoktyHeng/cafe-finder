/**
 * Classified Places API failure. `message` is internal and never contains the
 * API key or the raw upstream body; route handlers map `kind` to a safe
 * public error.
 */
export type GooglePlacesErrorKind =
  | "bad_request" // 400: our request was invalid (a bug, or an expired photo name)
  | "auth" // 401/403: key missing, invalid, or restricted
  | "not_found" // 404
  | "quota" // 429: quota or rate limit exhausted
  | "unavailable" // 5xx or network failure
  | "timeout"
  | "invalid_response"; // 2xx with an unexpected body

export class GooglePlacesError extends Error {
  constructor(
    readonly kind: GooglePlacesErrorKind,
    readonly httpStatus?: number,
    /** Google's canonical status, e.g. "RESOURCE_EXHAUSTED". Safe to log. */
    readonly upstreamStatus?: string,
    /** ErrorInfo reason, e.g. "API_KEY_INVALID". Safe to log. */
    readonly upstreamReason?: string,
  ) {
    super(`Google Places request failed: ${kind}`);
    this.name = "GooglePlacesError";
  }
}

/**
 * Google reports key problems (invalid, expired, restricted) as 400
 * INVALID_ARGUMENT or 403 with an ErrorInfo reason such as "API_KEY_INVALID".
 * Those are configuration failures, not bad input, so they map to `auth`.
 */
export function kindForHttpStatus(status: number, reason?: string): GooglePlacesErrorKind {
  if (reason?.startsWith("API_KEY_")) return "auth";
  if (status === 400) return "bad_request";
  if (status === 401 || status === 403) return "auth";
  if (status === 404) return "not_found";
  if (status === 429) return "quota";
  return "unavailable";
}

/** Only transient failures are retried; quota, auth and bad requests never are. */
export function isRetryable(kind: GooglePlacesErrorKind): boolean {
  return kind === "unavailable";
}
