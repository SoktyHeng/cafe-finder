import type { ServerEnv } from "@/lib/config/env-schema";
import { discoveryRequestSchema } from "@/lib/discovery/request-schema";
import type { NearbySearchResponse } from "@/lib/discovery/response-schema";
import { logEvent } from "@/lib/observability/log";
import {
  PlacesProviderUnavailableError,
  type PlacesProvider,
} from "@/lib/places/provider";
import { COVERAGE_NOTE } from "@/lib/places/schemas";
import { DEFAULT_SCORING_CONFIG, type ScoringConfig } from "@/lib/recommendation/config";
import {
  applyHardFilters,
  dedupeByPlaceId,
  withDistance,
} from "@/lib/recommendation/filters";
import type { CafeEvidence } from "@/lib/recommendation/factors";
import { rankCafes } from "@/lib/recommendation/score";
import { toCafeEvidence } from "@/lib/community/aggregate";
import type { AmenitySummary } from "@/lib/community/schemas";
import { UPSTREAM_UNAVAILABLE_MESSAGE, apiError } from "@/lib/security/api-error";
import type { RequestGuard } from "@/lib/security/request-guard";

/** A discovery request is ~300 bytes; anything far larger is not legitimate. */
export const MAX_BODY_BYTES = 2_048;

type NearbyEnv = Pick<
  ServerEnv,
  "PLACES_PROVIDER" | "GOOGLE_PLACES_SERVER_API_KEY" | "MAX_SEARCH_RADIUS_METERS"
>;

export type NearbyHandlerDeps = {
  getEnv: () => NearbyEnv;
  getProvider: (env: NearbyEnv) => PlacesProvider;
  /** Rate limiting; returns a ready 429 response when the caller must wait. */
  guard: (env: NearbyEnv) => RequestGuard;
  /** Ranking weights and thresholds (defaults in lib/recommendation/config.ts). */
  scoringConfig?: ScoringConfig;
  /**
   * Approved member reports per place (M6). Must never throw or stall
   * search; returns an empty map when unavailable.
   */
  getCommunity?: (placeIds: string[], now: Date) => Promise<Map<string, AmenitySummary[]>>;
  now?: () => Date;
};

async function readJsonBody(
  request: Request,
): Promise<{ ok: true; value: unknown } | { ok: false; message: string }> {
  const contentType = request.headers.get("content-type") ?? "";
  // Requiring JSON forces a CORS preflight for cross-site callers.
  if (!contentType.toLowerCase().startsWith("application/json")) {
    return { ok: false, message: "Expected a JSON request body." };
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    return { ok: false, message: "Request body is too large." };
  }
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, message: "Request body is not valid JSON." };
  }
}

export function createNearbySearchHandler({
  getEnv,
  getProvider,
  guard,
  scoringConfig = DEFAULT_SCORING_CONFIG,
  getCommunity = async () => new Map(),
  now = () => new Date(),
}: NearbyHandlerDeps) {
  return async function handleNearbySearch(request: Request): Promise<Response> {
    const body = await readJsonBody(request);
    if (!body.ok) {
      return apiError("VALIDATION_ERROR", body.message);
    }

    const parsed = discoveryRequestSchema.safeParse(body.value);
    if (!parsed.success) {
      // Field names only; never echo submitted values.
      const fields = [
        ...new Set(parsed.error.issues.map((issue) => issue.path.join(".") || "body")),
      ];
      return apiError(
        "VALIDATION_ERROR",
        `Invalid search parameters: ${fields.join(", ")}.`,
      );
    }
    const discovery = parsed.data;

    try {
      const env = getEnv();
      if (discovery.radiusMeters > env.MAX_SEARCH_RADIUS_METERS) {
        return apiError(
          "VALIDATION_ERROR",
          `Search radius cannot exceed ${env.MAX_SEARCH_RADIUS_METERS / 1000} km.`,
        );
      }
      // Rate limit only valid requests, right before the (billable) upstream call.
      const limited = guard(env)(request);
      if (limited) {
        return limited;
      }

      const provider = getProvider(env);
      const origin = {
        latitude: discovery.latitude,
        longitude: discovery.longitude,
      };
      const { places, attributions } = await provider.searchNearby({
        center: origin,
        radiusMeters: discovery.radiusMeters,
      });
      const { kept, excluded } = applyHardFilters(dedupeByPlaceId(places), discovery);

      const searchedAt = now();
      const community = await getCommunity(kept.map((cafe) => cafe.placeId), searchedAt).catch(
        () => new Map<string, AmenitySummary[]>(),
      );
      const evidenceByPlaceId = new Map<string, CafeEvidence>();
      for (const [placeId, summaries] of community) {
        const evidence = toCafeEvidence(summaries);
        if (evidence) evidenceByPlaceId.set(placeId, evidence);
      }
      const ranked = rankCafes(withDistance(kept, origin), discovery, { config: scoringConfig, evidenceByPlaceId });

      const response: NearbySearchResponse = {
        results: ranked.map((recommendation) => {
          const summaries = community.get(recommendation.cafe.placeId);
          return summaries && summaries.length > 0 ? { ...recommendation, community: summaries } : recommendation;
        }),
        searchedAt: searchedAt.toISOString(),
        source: provider.source,
        coverageNote: COVERAGE_NOTE,
        excluded,
        attributions,
      };
      return Response.json(response, {
        headers: { "Cache-Control": "no-store" },
      });
    } catch (error) {
      if (error instanceof PlacesProviderUnavailableError) {
        logEvent("warn", "nearby_search_unavailable", { reason: error.message });
        return apiError("UPSTREAM_UNAVAILABLE", UPSTREAM_UNAVAILABLE_MESSAGE);
      }
      // Structured, coordinate-free log line.
      logEvent("error", "nearby_search_failed", {
        errorName: error instanceof Error ? error.name : "unknown",
      });
      return apiError("INTERNAL_ERROR", "Something went wrong. Please try again.");
    }
  };
}
