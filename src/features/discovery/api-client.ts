import type { DiscoveryRequest } from "@/lib/discovery/request-schema";
import {
  nearbySearchResponseSchema,
  type NearbySearchResponse,
} from "@/lib/places/schemas";
import { apiErrorBodySchema, type ApiErrorCode } from "@/lib/security/api-error";

export const NEARBY_SEARCH_PATH = "/api/places/nearby";

export type SearchErrorCode = ApiErrorCode | "NETWORK_ERROR" | "INVALID_RESPONSE";

export type SearchOutcome =
  | { ok: true; data: NearbySearchResponse }
  | { ok: false; code: SearchErrorCode };

export async function fetchNearbyCafes(
  request: DiscoveryRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<SearchOutcome> {
  let response: Response;
  try {
    response = await fetchImpl(NEARBY_SEARCH_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
  } catch {
    return { ok: false, code: "NETWORK_ERROR" };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { ok: false, code: response.ok ? "INVALID_RESPONSE" : "INTERNAL_ERROR" };
  }

  if (!response.ok) {
    const parsed = apiErrorBodySchema.safeParse(body);
    return { ok: false, code: parsed.success ? parsed.data.error.code : "INTERNAL_ERROR" };
  }

  const parsed = nearbySearchResponseSchema.safeParse(body);
  return parsed.success
    ? { ok: true, data: parsed.data }
    : { ok: false, code: "INVALID_RESPONSE" };
}
