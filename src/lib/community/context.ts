import "server-only";

import { getServerEnv } from "@/lib/config/server-env";
import { logEvent } from "@/lib/observability/log";
import { clientKeyFromRequest } from "@/lib/security/rate-limit";
import { getPublicSupabaseClient } from "@/lib/supabase/public";
import { createSupabaseServerClient, getVerifiedUser } from "@/lib/supabase/server";

import { aggregateReports } from "./aggregate";
import { createCommunityHandlers, type CommunityContext } from "./handlers";
import type { AmenitySummary } from "./schemas";
import { createSupabaseCommunityMemberStore, createSupabaseCommunityReader } from "./supabase-store";

/** Reader as the member when signed in (so `is_own` works), otherwise as anon. */
export async function getCommunityContext(): Promise<CommunityContext> {
  const client = await createSupabaseServerClient();
  if (!client) return "unconfigured";
  const user = await getVerifiedUser(client);
  if (user) {
    return {
      reader: createSupabaseCommunityReader(client),
      member: { userId: user.id, store: createSupabaseCommunityMemberStore(client) },
    };
  }
  const anon = getPublicSupabaseClient();
  return anon ? { reader: createSupabaseCommunityReader(anon), member: null } : "unconfigured";
}

/** One handler set (and limiters) per server instance. */
export const communityRoutes = createCommunityHandlers({
  getContext: getCommunityContext,
  clientKey: (request) => clientKeyFromRequest(request, getServerEnv().TRUST_PROXY),
});

const SEARCH_TIMEOUT_MS = 2_000;

/**
 * Member summaries for search results. Search must never fail or stall
 * because of community data: on any error or timeout it returns nothing.
 */
export async function loadCommunitySummaries(placeIds: readonly string[], now: Date): Promise<Map<string, AmenitySummary[]>> {
  const client = getPublicSupabaseClient();
  if (!client || placeIds.length === 0) return new Map();
  const reader = createSupabaseCommunityReader(client);
  try {
    const reports = await Promise.race([
      reader.amenityReports(placeIds.slice(0, 50)),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), SEARCH_TIMEOUT_MS)),
    ]);
    return aggregateReports(reports, now);
  } catch (error) {
    logEvent("warn", "community_summaries_unavailable", {
      reason: error instanceof Error ? error.message : "unknown",
    });
    return new Map();
  }
}
