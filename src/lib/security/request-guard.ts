import { logEvent } from "@/lib/observability/log";

import { apiError } from "./api-error";
import {
  FixedWindowRateLimiter,
  clientKeyFromRequest,
  type RateLimitResult,
} from "./rate-limit";

export const RATE_LIMIT_WINDOW_MS = 60_000;

export type RequestGuard = (request: Request) => Response | null;

export type RequestGuardOptions = {
  /** Used in logs only. */
  name: string;
  perClientLimit: number;
  /** Shared across every guarded endpoint so the total upstream volume is capped. */
  globalLimiter: FixedWindowRateLimiter;
  trustProxy: boolean;
  now?: () => number;
};

/** Returns a 429 response when a limit is hit, otherwise `null`. */
export function createRequestGuard({
  name,
  perClientLimit,
  globalLimiter,
  trustProxy,
  now,
}: RequestGuardOptions): RequestGuard {
  const perClient = new FixedWindowRateLimiter({
    limit: perClientLimit,
    windowMs: RATE_LIMIT_WINDOW_MS,
    now,
  });

  return (request) => {
    const clientResult = perClient.consume(clientKeyFromRequest(request, trustProxy));
    const result: RateLimitResult = clientResult.allowed
      ? globalLimiter.consume("global")
      : clientResult;
    if (result.allowed) {
      return null;
    }
    logEvent("warn", "rate_limited", {
      guard: name,
      scope: clientResult.allowed ? "global" : "client",
    });
    return apiError(
      "RATE_LIMITED",
      "Too many requests. Please wait a moment and try again.",
      { "Retry-After": String(result.retryAfterSeconds) },
    );
  };
}
