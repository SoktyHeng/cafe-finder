import type { ServerEnv } from "@/lib/config/env-schema";
import { discoveryRequestSchema } from "@/lib/discovery/request-schema";
import { logEvent } from "@/lib/observability/log";
import {
  PlacesProviderUnavailableError,
  type PlacesProvider,
} from "@/lib/places/provider";
import {
  COVERAGE_NOTE,
  type NearbySearchResponse,
} from "@/lib/places/schemas";
import {
  applyHardFilters,
  dedupeByPlaceId,
  orderByDistance,
  withDistance,
} from "@/lib/recommendation/filters";
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

      const response: NearbySearchResponse = {
        results: orderByDistance(withDistance(kept, origin)),
        searchedAt: now().toISOString(),
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
