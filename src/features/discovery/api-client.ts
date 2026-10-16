import type { DiscoveryRequest } from "@/lib/discovery/request-schema";
import {
  nearbySearchResponseSchema,
  type NearbySearchResponse,
} from "@/lib/discovery/response-schema";
import { requestApi, type ApiFailureCode, type ApiOutcome } from "@/lib/http/request-api";

export const NEARBY_SEARCH_PATH = "/api/places/nearby";

export type SearchErrorCode = ApiFailureCode;

export type SearchOutcome = ApiOutcome<NearbySearchResponse>;

export function fetchNearbyCafes(
  request: DiscoveryRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<SearchOutcome> {
  return requestApi(
    NEARBY_SEARCH_PATH,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    },
    nearbySearchResponseSchema,
    fetchImpl,
  );
}
