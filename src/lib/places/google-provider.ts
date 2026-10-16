import "server-only";

import { GooglePlacesError } from "@/lib/google/errors";
import {
  CAFE_PLACE_TYPES,
  RESPONSE_LANGUAGE,
  type GooglePlacesClient,
} from "@/lib/google/places-client";
import {
  googleNearbyResponseSchema,
  googlePhotoMediaResponseSchema,
  type GooglePlace,
} from "@/lib/google/response-schemas";
import { logEvent } from "@/lib/observability/log";
import { safeGooglePhotoUrl } from "@/lib/security/safe-url";

import {
  collectAttributions,
  normalizeNearbyPlace,
  normalizePlaceDetails,
  parseGooglePlace,
} from "./google-normalize";
import {
  MAX_NEARBY_RESULTS,
  PlacesProviderUnavailableError,
  type NearbySearchParams,
  type NearbySearchResult,
  type PhotoWidth,
  type PlaceDetailsResult,
  type PlacesProvider,
} from "./provider";
import { PHOTO_NAME_PATTERN, PLACE_ID_PATTERN } from "./schemas";

/** Converts vendor failures into the provider-neutral unavailable error. */
function unavailable(error: unknown): never {
  if (error instanceof GooglePlacesError) {
    throw new PlacesProviderUnavailableError(`google:${error.kind}`);
  }
  throw error;
}

/**
 * Live provider backed by Places API (New). Results are fetched per request
 * and never cached or persisted (Google Maps Platform terms).
 */
export class GooglePlacesProvider implements PlacesProvider {
  readonly source = "google" as const;

  constructor(private readonly client: GooglePlacesClient) {}

  async searchNearby({ center, radiusMeters }: NearbySearchParams): Promise<NearbySearchResult> {
    let raw: unknown;
    try {
      raw = await this.client.searchNearby({
        includedTypes: [...CAFE_PLACE_TYPES],
        maxResultCount: MAX_NEARBY_RESULTS,
        rankPreference: "POPULARITY",
        languageCode: RESPONSE_LANGUAGE,
        locationRestriction: {
          circle: {
            center: { latitude: center.latitude, longitude: center.longitude },
            radius: radiusMeters,
          },
        },
      });
    } catch (error) {
      unavailable(error);
    }

    const response = googleNearbyResponseSchema.safeParse(raw);
    if (!response.success) {
      logEvent("error", "places_invalid_response", { endpoint: "nearbySearch" });
      throw new PlacesProviderUnavailableError("google:invalid_response");
    }

    const seen = new Set<string>();
    const places: GooglePlace[] = [];
    let skipped = 0;
    for (const item of response.data.places ?? []) {
      const place = parseGooglePlace(item);
      if (!place) {
        skipped += 1;
      } else if (!seen.has(place.id)) {
        seen.add(place.id);
        places.push(place);
      }
    }
    if (skipped > 0) {
      logEvent("warn", "places_skipped_malformed", { endpoint: "nearbySearch", count: skipped });
    }

    return {
      places: places.map(normalizeNearbyPlace),
      attributions: collectAttributions(places),
    };
  }

  async getPlaceDetails(placeId: string): Promise<PlaceDetailsResult | null> {
    if (!PLACE_ID_PATTERN.test(placeId)) {
      return null;
    }
    let raw: unknown;
    try {
      raw = await this.client.getPlace(placeId);
    } catch (error) {
      if (
        error instanceof GooglePlacesError &&
        (error.kind === "not_found" || error.kind === "bad_request")
      ) {
        // Unknown or malformed IDs (Google answers 400 INVALID_ARGUMENT for some).
        return null;
      }
      unavailable(error);
    }

    const place = parseGooglePlace(raw);
    if (!place) {
      logEvent("error", "places_invalid_response", { endpoint: "placeDetails" });
      throw new PlacesProviderUnavailableError("google:invalid_response");
    }
    return {
      place: normalizePlaceDetails(place),
      attributions: collectAttributions([place]),
    };
  }

  async getPhotoUrl(photoName: string, maxWidthPx: PhotoWidth): Promise<string | null> {
    if (!PHOTO_NAME_PATTERN.test(photoName)) {
      return null;
    }
    let raw: unknown;
    try {
      raw = await this.client.getPhotoMedia(photoName, maxWidthPx);
    } catch (error) {
      if (
        error instanceof GooglePlacesError &&
        (error.kind === "not_found" || error.kind === "bad_request")
      ) {
        // Photo names expire; the caller should refetch place details.
        return null;
      }
      unavailable(error);
    }

    const media = googlePhotoMediaResponseSchema.safeParse(raw);
    const url = media.success ? safeGooglePhotoUrl(media.data.photoUri) : undefined;
    if (!url) {
      logEvent("error", "places_invalid_response", { endpoint: "placePhoto" });
      throw new PlacesProviderUnavailableError("google:invalid_response");
    }
    return url;
  }
}
