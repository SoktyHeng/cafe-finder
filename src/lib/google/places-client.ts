import "server-only";

import { logEvent } from "@/lib/observability/log";

import { GooglePlacesError, isRetryable, kindForHttpStatus } from "./errors";
import {
  FIELD_MASK_SKU,
  NEARBY_SEARCH_FIELD_MASK,
  PLACE_DETAILS_FIELD_MASK,
} from "./field-masks";
import { googleErrorBodySchema } from "./response-schemas";

export const PLACES_API_BASE_URL = "https://places.googleapis.com/v1";

/** Per-attempt timeout. Nearby/Details typically answer well under 1 s. */
export const REQUEST_TIMEOUT_MS = 5_000;
/** One retry, for transient (5xx/network) failures only. */
export const MAX_RETRIES = 1;
export const RETRY_DELAY_MS = 250;

/** Place types from Table A. Both are valid `includedTypes` filters. */
export const CAFE_PLACE_TYPES = ["cafe", "coffee_shop"] as const;
export const RESPONSE_LANGUAGE = "en";

export type NearbySearchRequestBody = {
  includedTypes: string[];
  maxResultCount: number;
  rankPreference: "POPULARITY" | "DISTANCE";
  languageCode: string;
  locationRestriction: {
    circle: {
      center: { latitude: number; longitude: number };
      radius: number;
    };
  };
};

type Endpoint = keyof typeof FIELD_MASK_SKU;

export type GooglePlacesClientOptions = {
  apiKey: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  retryDelayMs?: number;
};

/**
 * Low-level Places API (New) HTTP client. Server only: the key travels in
 * the `X-Goog-Api-Key` header, never in URLs, logs or errors.
 */
export class GooglePlacesClient {
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly retryDelayMs: number;

  constructor({
    apiKey,
    fetchImpl = fetch,
    timeoutMs = REQUEST_TIMEOUT_MS,
    retryDelayMs = RETRY_DELAY_MS,
  }: GooglePlacesClientOptions) {
    this.apiKey = apiKey;
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
    this.retryDelayMs = retryDelayMs;
  }

  searchNearby(body: NearbySearchRequestBody): Promise<unknown> {
    return this.request("nearbySearch", `${PLACES_API_BASE_URL}/places:searchNearby`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-FieldMask": NEARBY_SEARCH_FIELD_MASK,
      },
      body: JSON.stringify(body),
    });
  }

  getPlace(placeId: string): Promise<unknown> {
    const url = new URL(`${PLACES_API_BASE_URL}/places/${encodeURIComponent(placeId)}`);
    url.searchParams.set("languageCode", RESPONSE_LANGUAGE);
    return this.request("placeDetails", url.toString(), {
      method: "GET",
      headers: { "X-Goog-FieldMask": PLACE_DETAILS_FIELD_MASK },
    });
  }

  /** Resolves a photo name to a short-lived image URL without redirecting. */
  getPhotoMedia(photoName: string, maxWidthPx: number): Promise<unknown> {
    // `photoName` is pattern-validated by the caller; segments are already URL-safe.
    const url = new URL(`${PLACES_API_BASE_URL}/${photoName}/media`);
    url.searchParams.set("maxWidthPx", String(maxWidthPx));
    url.searchParams.set("skipHttpRedirect", "true");
    return this.request("placePhoto", url.toString(), { method: "GET", headers: {} });
  }

  private async request(
    endpoint: Endpoint,
    url: string,
    init: { method: string; headers: Record<string, string>; body?: string },
  ): Promise<unknown> {
    for (let attempt = 0; ; attempt++) {
      const startedAt = Date.now();
      try {
        const result = await this.attempt(url, init);
        this.logCall(endpoint, attempt, startedAt);
        return result;
      } catch (error) {
        const failure =
          error instanceof GooglePlacesError ? error : new GooglePlacesError("unavailable");
        this.logCall(endpoint, attempt, startedAt, failure);
        if (attempt >= MAX_RETRIES || !isRetryable(failure.kind)) {
          throw failure;
        }
        await new Promise((resolve) => setTimeout(resolve, this.retryDelayMs));
      }
    }
  }

  private async attempt(
    url: string,
    init: { method: string; headers: Record<string, string>; body?: string },
  ): Promise<unknown> {
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: init.method,
        headers: { ...init.headers, "X-Goog-Api-Key": this.apiKey },
        body: init.body,
        signal: AbortSignal.timeout(this.timeoutMs),
        cache: "no-store",
      });
    } catch (error) {
      // AbortSignal.timeout() rejects with a DOMException named "TimeoutError";
      // DOMException is not an Error subclass in every runtime, so check the name.
      const timedOut =
        typeof error === "object" &&
        error !== null &&
        "name" in error &&
        error.name === "TimeoutError";
      throw new GooglePlacesError(timedOut ? "timeout" : "unavailable");
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = undefined;
    }

    if (!response.ok) {
      const parsed = googleErrorBodySchema.safeParse(body);
      const upstream = parsed.success ? parsed.data.error : undefined;
      const reason = upstream?.details?.find((detail) => detail.reason)?.reason;
      throw new GooglePlacesError(
        kindForHttpStatus(response.status, reason),
        response.status,
        upstream?.status,
        reason,
      );
    }
    if (body === undefined) {
      throw new GooglePlacesError("invalid_response", response.status);
    }
    return body;
  }

  private logCall(endpoint: Endpoint, attempt: number, startedAt: number, failure?: GooglePlacesError) {
    // Coarse usage/cost telemetry: endpoint, billing SKU, outcome, latency.
    // Auth failures are errors: the deployment is misconfigured.
    logEvent(failure ? (failure.kind === "auth" ? "error" : "warn") : "info", "places_api_call", {
      endpoint,
      sku: FIELD_MASK_SKU[endpoint],
      outcome: failure?.kind ?? "ok",
      httpStatus: failure ? failure.httpStatus : 200,
      upstreamStatus: failure?.upstreamStatus,
      upstreamReason: failure?.upstreamReason,
      attempt,
      durationMs: Date.now() - startedAt,
    });
  }
}
