import {
  GOOGLE_AMENITY_FIELDS,
  googlePlaceSchema,
  googleReviewSchema,
  type GooglePlace,
} from "@/lib/google/response-schemas";
import {
  safeGoogleMapsUrl,
  safeGooglePhotoUrl,
  safeHttpsUrl,
  safeWebUrl,
} from "@/lib/security/safe-url";

import {
  MAX_DETAIL_PHOTOS,
  MAX_REVIEWS,
  PHOTO_NAME_PATTERN,
  PLACE_ID_PATTERN,
  type Amenities,
  type BusinessStatus,
  type CafeDetails,
  type CafePlace,
  type DataProviderAttribution,
  type PlacePhoto,
  type PlaceReview,
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

/** Reviews keep Google's wording; only unsafe links and malformed entries are dropped. */
function normalizeReviews(place: GooglePlace): PlaceReview[] {
  const reviews: PlaceReview[] = [];
  for (const raw of place.reviews ?? []) {
    const parsed = googleReviewSchema.safeParse(raw);
    const authorName = parsed.success ? parsed.data.authorAttribution?.displayName?.trim() : undefined;
    // Attribution is mandatory: a review without an author is not shown.
    if (!parsed.success || !authorName) continue;
    const review = parsed.data;
    // Normalized to millisecond ISO (Google may send nanoseconds).
    const publishTime =
      review.publishTime && !Number.isNaN(Date.parse(review.publishTime))
        ? new Date(review.publishTime).toISOString()
        : undefined;
    const authorUri = safeHttpsUrl(review.authorAttribution?.uri);
    const authorPhotoUri = safeGooglePhotoUrl(review.authorAttribution?.photoUri);
    const googleMapsUri = safeGoogleMapsUrl(review.googleMapsUri);
    const text = review.text?.text.trim();
    reviews.push({
      authorName,
      ...(authorUri && { authorUri }),
      ...(authorPhotoUri && { authorPhotoUri }),
      ...(review.rating !== undefined && review.rating >= 1 && review.rating <= 5 && { rating: review.rating }),
      ...(review.relativePublishTimeDescription && { relativePublishTime: review.relativePublishTimeDescription }),
      ...(publishTime && { publishTime }),
      ...(text && { text }),
      translated:
        review.text?.languageCode !== undefined &&
        review.originalText?.languageCode !== undefined &&
        review.text.languageCode !== review.originalText.languageCode,
      ...(googleMapsUri && { googleMapsUri }),
    });
    if (reviews.length === MAX_REVIEWS) break;
  }
  return reviews;
}

function normalizeAmenities(place: GooglePlace): Amenities {
  const amenities: Amenities = {};
  for (const field of GOOGLE_AMENITY_FIELDS) {
    const value = place[field];
    if (typeof value === "boolean") amenities[field] = value;
  }
  const nested = {
    wheelchairAccessibleEntrance: place.accessibilityOptions?.wheelchairAccessibleEntrance,
    wheelchairAccessibleSeating: place.accessibilityOptions?.wheelchairAccessibleSeating,
    acceptsCreditCards: place.paymentOptions?.acceptsCreditCards,
    acceptsNfc: place.paymentOptions?.acceptsNfc,
    acceptsCashOnly: place.paymentOptions?.acceptsCashOnly,
  } as const;
  for (const [key, value] of Object.entries(nested) as [keyof typeof nested, boolean | undefined][]) {
    if (typeof value === "boolean") amenities[key] = value;
  }
  return amenities;
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
    reviews: normalizeReviews(place),
    amenities: normalizeAmenities(place),
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
