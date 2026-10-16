"use client";

import { useKeyedRequest, type KeyedRequestState } from "@/hooks/use-keyed-request";
import type { DiscoveryRequest } from "@/lib/discovery/request-schema";

import { fetchNearbyCafes, type SearchOutcome } from "../api-client";

export type NearbySearchState = KeyedRequestState<SearchOutcome>;

/**
 * Runs a search for `request` whenever `searchKey` changes. Callers derive the
 * key from an explicit user action (the URL after "Find My Cafe"), never from
 * live form edits. One submitted search is exactly one API call.
 */
export function useNearbySearch(
  request: DiscoveryRequest | null,
  searchKey: string | null,
): { state: NearbySearchState; retry: () => void } {
  return useKeyedRequest(
    request !== null && searchKey !== null ? `nearby:${searchKey}` : null,
    () => (request ? fetchNearbyCafes(request) : Promise.reject(new Error("No request"))),
  );
}
