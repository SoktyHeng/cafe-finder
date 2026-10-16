import {
  googlePlaceSchema,
  type GooglePlace,
} from "@/lib/google/response-schemas";
import {
  safeGoogleMapsUrl,
  safeHttpsUrl,
  safeWebUrl,
} from "@/lib/security/safe-url";

import {
  MAX_DETAIL_PHOTOS,
  PHOTO_NAME_PATTERN,
  PLACE_ID_PATTERN,
  type BusinessStatus,
  type CafeDetails,
  type CafePlace,
  type DataProviderAttribution,
  type PlacePhoto,
  type PriceLevel,
} from "./schemas";

/**
 * Maps Google Place payloads to the vendor-neutral DTOs. Every field is
 * mapped explicitly; anything missing or malformed becomes `undefined`
 * ("unknown"). Nothing is defaulted, coerced or invented.
 */

const PRICE_LEVEL_MAP: Record<string, PriceLevel> = {
  PRICE_LEVEL_FREE: "free",
  PRICE_LEVEL_INEXPENSIVE: "inexpensive",
  PRICE_LEVEL_MODERATE: "moderate",
  PRICE_LEVEL_EXPENSIVE: "expensive",
  PRICE_LEVEL_VERY_EXPENSIVE: "very_expensive",
};

const BUSINESS_STATUS_MAP: Record<string, BusinessStatus> = {
  OPERATIONAL: "operational",
  CLOSED_TEMPORARILY: "closed_temporarily",
  CLOSED_PERMANENTLY: "closed_permanently",
};

const isCoordinate = (value: number, limit: number) =>
  Number.isFinite(value) && Math.abs(value) <= limit;

function normalizeBase(place: GooglePlace): CafePlace {
  const location =
    place.location &&
    isCoordinate(place.location.latitude, 90) &&
    isCoordinate(place.location.longitude, 180)
      ? place.location
      : undefined;
  const rating =
    place.rating !== undefined && place.rating >= 0 && place.rating <= 5
      ? place.rating
      : undefined;
  const ratingCount =
    place.userRatingCount !== undefined &&
    Number.isInteger(place.userRatingCount) &&
    place.userRatingCount >= 0
      ? place.userRatingCount
      : undefined;
  const name = place.displayName?.text.trim();

  return {
    placeId: place.id,
    ...(name && { name }),
    ...(location && { latitude: location.latitude, longitude: location.longitude }),
    ...((place.shortFormattedAddress ?? place.formattedAddress) && {
      address: place.shortFormattedAddress ?? place.formattedAddress,
    }),
    ...(rating !== undefined && { rating }),
    ...(ratingCount !== undefined && { ratingCount }),
    ...(place.priceLevel && PRICE_LEVEL_MAP[place.priceLevel] && {
      priceLevel: PRICE_LEVEL_MAP[place.priceLevel],
    }),
    // `openNow` absent means unknown. Never default it to false.
    ...(typeof place.currentOpeningHours?.openNow === "boolean" && {
      openNow: place.currentOpeningHours.openNow,
    }),
    ...(place.businessStatus && BUSINESS_STATUS_MAP[place.businessStatus] && {
      businessStatus: BUSINESS_STATUS_MAP[place.businessStatus],
    }),
    ...(safeGoogleMapsUrl(place.googleMapsUri) && {
      googleMapsUri: safeGoogleMapsUrl(place.googleMapsUri),
    }),
    dataSource: "google",
  };
}

function normalizePhotos(place: GooglePlace): PlacePhoto[] {
  return (place.photos ?? [])
    .filter((photo) => PHOTO_NAME_PATTERN.test(photo.name))
    .slice(0, MAX_DETAIL_PHOTOS)
    .map((photo) => ({
      name: photo.name,
      ...(photo.widthPx && Number.isInteger(photo.widthPx) && photo.widthPx > 0 && {
        widthPx: photo.widthPx,
      }),
      ...(photo.heightPx && Number.isInteger(photo.heightPx) && photo.heightPx > 0 && {
        heightPx: photo.heightPx,
      }),
      authorAttributions: (photo.authorAttributions ?? []).flatMap((author) =>
        author.displayName
          ? [
              {
                displayName: author.displayName,
                ...(safeHttpsUrl(author.uri) && { uri: safeHttpsUrl(author.uri) }),
              },
            ]
          : [],
      ),
    }));
}

/** Parses one raw place; returns `undefined` if it lacks a usable ID. */
export function parseGooglePlace(raw: unknown): GooglePlace | undefined {
  const parsed = googlePlaceSchema.safeParse(raw);
  return parsed.success && PLACE_ID_PATTERN.test(parsed.data.id) ? parsed.data : undefined;
}

export function normalizeNearbyPlace(place: GooglePlace): CafePlace {
  return normalizeBase(place);
}

export function normalizePlaceDetails(place: GooglePlace): CafeDetails {
  const weekdayDescriptions = place.currentOpeningHours?.weekdayDescriptions;
  const websiteUri = safeWebUrl(place.websiteUri);
  const phoneNumber = place.nationalPhoneNumber?.trim();

  return {
    ...normalizeBase(place),
    ...(weekdayDescriptions &&
      weekdayDescriptions.length > 0 &&
      weekdayDescriptions.length <= 7 && { weekdayDescriptions }),
    ...(place.utcOffsetMinutes !== undefined &&
      Number.isInteger(place.utcOffsetMinutes) && { utcOffsetMinutes: place.utcOffsetMinutes }),
    ...(websiteUri && { websiteUri }),
    ...(phoneNumber && phoneNumber.length <= 64 && { phoneNumber }),
    photos: normalizePhotos(place),
  };
}

/** Unique third-party providers across places (Google requires crediting them). */
export function collectAttributions(places: readonly GooglePlace[]): DataProviderAttribution[] {
  const byProvider = new Map<string, DataProviderAttribution>();
  for (const place of places) {
    for (const attribution of place.attributions ?? []) {
      const provider = attribution.provider?.trim();
      if (!provider || byProvider.has(provider)) continue;
      const providerUri = safeWebUrl(attribution.providerUri);
      byProvider.set(provider, { provider, ...(providerUri && { providerUri }) });
    }
  }
  return [...byProvider.values()];
}
