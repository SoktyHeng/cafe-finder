import type { ServerEnv } from "@/lib/config/env-schema";
import { discoveryRequestSchema } from "@/lib/discovery/request-schema";
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
  orderByDistance,
  withDistance,
} from "@/lib/recommendation/filters";
import { apiError } from "@/lib/security/api-error";

/** A discovery request is ~300 bytes; anything far larger is not legitimate. */
export const MAX_BODY_BYTES = 2_048;

export type NearbyHandlerDeps = {
  getEnv: () => Pick<ServerEnv, "PLACES_PROVIDER" | "MAX_SEARCH_RADIUS_METERS">;
  getProvider: (env: Pick<ServerEnv, "PLACES_PROVIDER">) => PlacesProvider;
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

      const provider = getProvider(env);
      const origin = {
        latitude: discovery.latitude,
        longitude: discovery.longitude,
      };
      const candidates = await provider.searchNearby({
        center: origin,
        radiusMeters: discovery.radiusMeters,
      });
      const { kept, excluded } = applyHardFilters(candidates, discovery);

      const response: NearbySearchResponse = {
        results: orderByDistance(withDistance(kept, origin)),
        searchedAt: now().toISOString(),
        source: provider.source,
        coverageNote: COVERAGE_NOTE,
        excluded,
      };
      return Response.json(response, {
        headers: { "Cache-Control": "no-store" },
      });
    } catch (error) {
      if (error instanceof PlacesProviderUnavailableError) {
        return apiError(
          "UPSTREAM_UNAVAILABLE",
          "Cafe search is temporarily unavailable. Please try again later.",
        );
      }
      // Structured, coordinate-free log line.
      console.error(
        JSON.stringify({
          event: "nearby_search_failed",
          errorName: error instanceof Error ? error.name : "unknown",
        }),
      );
      return apiError("INTERNAL_ERROR", "Something went wrong. Please try again.");
    }
  };
}
