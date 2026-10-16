import "server-only";

import type { ServerEnv } from "@/lib/config/env-schema";

import { FixedWindowRateLimiter } from "./rate-limit";
import { RATE_LIMIT_WINDOW_MS, createRequestGuard, type RequestGuard } from "./request-guard";

/**
 * Per-process guards for the Places routes, created lazily from validated
 * env. The global limiter is shared so all endpoints together are capped.
 */
type Guards = { nearby: RequestGuard; details: RequestGuard; photos: RequestGuard };

let guards: Guards | undefined;

export function getPlacesGuards(env: ServerEnv): Guards {
  if (!guards) {
    const globalLimiter = new FixedWindowRateLimiter({
      limit: env.PLACES_GLOBAL_RATE_LIMIT_PER_MINUTE,
      windowMs: RATE_LIMIT_WINDOW_MS,
    });
    const shared = { globalLimiter, trustProxy: env.TRUST_PROXY };
    guards = {
      nearby: createRequestGuard({
        name: "nearby",
        perClientLimit: env.DISCOVERY_RATE_LIMIT_PER_MINUTE,
        ...shared,
      }),
      details: createRequestGuard({
        name: "details",
        perClientLimit: env.PLACE_DETAILS_RATE_LIMIT_PER_MINUTE,
        ...shared,
      }),
      photos: createRequestGuard({
        name: "photos",
        perClientLimit: env.PLACE_PHOTOS_RATE_LIMIT_PER_MINUTE,
        ...shared,
      }),
    };
  }
  return guards;
}
