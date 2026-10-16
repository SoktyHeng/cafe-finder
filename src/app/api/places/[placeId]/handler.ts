import type { ServerEnv } from "@/lib/config/env-schema";
import { logEvent } from "@/lib/observability/log";
import {
  PlacesProviderUnavailableError,
  type PlacesProvider,
} from "@/lib/places/provider";
import {
  PLACE_ID_PATTERN,
  type PlaceDetailsResponse,
} from "@/lib/places/schemas";
import { UPSTREAM_UNAVAILABLE_MESSAGE, apiError } from "@/lib/security/api-error";
import type { RequestGuard } from "@/lib/security/request-guard";

type DetailsEnv = Pick<ServerEnv, "PLACES_PROVIDER" | "GOOGLE_PLACES_SERVER_API_KEY">;

export type PlaceDetailsHandlerDeps = {
  getEnv: () => DetailsEnv;
  getProvider: (env: DetailsEnv) => PlacesProvider;
  guard: (env: DetailsEnv) => RequestGuard;
  now?: () => Date;
};

/**
 * `GET /api/places/[placeId]`: details fetched on demand with a narrow field
 * mask, returned as the normalized DTO plus required attributions.
 */
export function createPlaceDetailsHandler({
  getEnv,
  getProvider,
  guard,
  now = () => new Date(),
}: PlaceDetailsHandlerDeps) {
  return async function handlePlaceDetails(
    request: Request,
    placeId: string,
  ): Promise<Response> {
    if (!PLACE_ID_PATTERN.test(placeId)) {
      return apiError("VALIDATION_ERROR", "Invalid place ID.");
    }

    try {
      const env = getEnv();
      const limited = guard(env)(request);
      if (limited) {
        return limited;
      }

      const provider = getProvider(env);
      const result = await provider.getPlaceDetails(placeId);
      if (!result) {
        return apiError("NOT_FOUND", "We couldn't find that cafe.");
      }

      const response: PlaceDetailsResponse = {
        place: result.place,
        fetchedAt: now().toISOString(),
        source: provider.source,
        attributions: result.attributions,
      };
      return Response.json(response, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      if (error instanceof PlacesProviderUnavailableError) {
        logEvent("warn", "place_details_unavailable", { reason: error.message });
        return apiError("UPSTREAM_UNAVAILABLE", UPSTREAM_UNAVAILABLE_MESSAGE);
      }
      logEvent("error", "place_details_failed", {
        errorName: error instanceof Error ? error.name : "unknown",
      });
      return apiError("INTERNAL_ERROR", "Something went wrong. Please try again.");
    }
  };
}
