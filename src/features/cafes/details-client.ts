"use client";

import { useKeyedRequest, type KeyedRequestState } from "@/hooks/use-keyed-request";
import { requestApi, type ApiOutcome } from "@/lib/http/request-api";
import {
  PLACE_ID_PATTERN,
  placeDetailsResponseSchema,
  type PlaceDetailsResponse,
} from "@/lib/places/schemas";

export type DetailsOutcome = ApiOutcome<PlaceDetailsResponse>;
export type DetailsState = KeyedRequestState<DetailsOutcome>;

export function placeDetailsPath(placeId: string): string {
  return `/api/places/${encodeURIComponent(placeId)}`;
}

export function fetchPlaceDetails(
  placeId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<DetailsOutcome> {
  return requestApi(placeDetailsPath(placeId), { method: "GET" }, placeDetailsResponseSchema, fetchImpl);
}

/**
 * Loads details once per opened page (billable Place Details call). Invalid
 * IDs never reach the network.
 */
export function usePlaceDetails(placeId: string): { state: DetailsState; retry: () => void } {
  const valid = PLACE_ID_PATTERN.test(placeId);
  return useKeyedRequest(valid ? `details:${placeId}` : null, () => fetchPlaceDetails(placeId));
}
