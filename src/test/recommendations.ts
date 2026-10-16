import type { DiscoveryRequest } from "@/lib/discovery/request-schema";
import type { NearbySearchResponse } from "@/lib/discovery/response-schema";
import type { CafePlace } from "@/lib/places/schemas";
import { rankCafes, scoreCafe } from "@/lib/recommendation/score";

/** Test helpers that build recommendations with the real scorer. */

export const TEST_REQUEST: DiscoveryRequest = {
  latitude: 11.553,
  longitude: 104.925,
  radiusMeters: 3000,
  purpose: "work",
};

export const testCafe = (overrides: Partial<CafePlace> & { placeId: string }): CafePlace => ({
  dataSource: "fixture",
  ...overrides,
});

export function recommend(cafe: CafePlace, request: Partial<DiscoveryRequest> = {}) {
  return scoreCafe(cafe, { ...TEST_REQUEST, ...request });
}

export function nearbyResponse(
  cafes: CafePlace[],
  overrides: Partial<NearbySearchResponse> = {},
  request: Partial<DiscoveryRequest> = {},
): NearbySearchResponse {
  return {
    results: rankCafes(cafes, { ...TEST_REQUEST, ...request }),
    searchedAt: "2026-10-16T00:00:00.000Z",
    source: "fixture",
    coverageNote: "Results are a subset of nearby cafes, not an exhaustive list.",
    excluded: { belowMinRating: 0, closedNow: 0, permanentlyClosed: 0 },
    attributions: [],
    ...overrides,
  };
}
