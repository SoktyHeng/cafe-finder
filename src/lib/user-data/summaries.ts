import "server-only";

import { getServerEnv } from "@/lib/config/server-env";
import { logEvent } from "@/lib/observability/log";
import { getPlacesProvider } from "@/lib/places/get-provider";
import type { PlaceSummary } from "@/lib/places/schemas";
import { FixedWindowRateLimiter } from "@/lib/security/rate-limit";

/** Each summary is a billable Place Details (Pro) call, so lists are bounded. */
export const MAX_SUMMARIES_PER_PAGE = 50;
const CONCURRENCY = 5;
const PAGE_LOADS_PER_MINUTE = 10;
const pageLoads = new FixedWindowRateLimiter({ limit: PAGE_LOADS_PER_MINUTE, windowMs: 60_000 });

export type SummaryResult = {
  summaries: Record<string, PlaceSummary>;
  /** True when details were skipped (rate limit or provider outage); the list still renders. */
  degraded: boolean;
};

/** Fetches display details for saved place IDs. Never stored, refetched per view. */
export async function loadPlaceSummaries(userId: string, placeIds: readonly string[]): Promise<SummaryResult> {
  const ids = [...new Set(placeIds)].slice(0, MAX_SUMMARIES_PER_PAGE);
  if (ids.length === 0) return { summaries: {}, degraded: false };
  if (!pageLoads.consume(userId).allowed) {
    logEvent("warn", "rate_limited", { guard: "favorites_summaries", scope: "client" });
    return { summaries: {}, degraded: true };
  }

  let provider;
  try {
    provider = getPlacesProvider(getServerEnv());
  } catch {
    return { summaries: {}, degraded: true };
  }

  const summaries: Record<string, PlaceSummary> = {};
  let degraded = false;
  let cursor = 0;
  const worker = async () => {
    while (cursor < ids.length) {
      const placeId = ids[cursor++] as string;
      try {
        const summary = await provider.getPlaceSummary(placeId);
        if (summary) summaries[placeId] = summary;
      } catch {
        degraded = true;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, ids.length) }, worker));
  return { summaries, degraded };
}
