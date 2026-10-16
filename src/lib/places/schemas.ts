import { z } from "zod";

/**
 * Normalized, vendor-neutral cafe DTO (CLAUDE.md §6.5). Every Google-derived
 * field is optional: `undefined` means "unknown", never a default value.
 */

export const DATA_SOURCES = ["google", "fixture"] as const;
export type DataSource = (typeof DATA_SOURCES)[number];

/** Qualitative price level. Not a menu-price estimate. */
export const PRICE_LEVELS = [
  "free",
  "inexpensive",
  "moderate",
  "expensive",
  "very_expensive",
] as const;
export type PriceLevel = (typeof PRICE_LEVELS)[number];

export const BUSINESS_STATUSES = [
  "operational",
  "closed_temporarily",
  "closed_permanently",
] as const;
export type BusinessStatus = (typeof BUSINESS_STATUSES)[number];

export const cafePlaceSchema = z.strictObject({
  placeId: z.string().min(1).max(256),
  name: z.string().optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  address: z.string().optional(),
  rating: z.number().min(0).max(5).optional(),
  ratingCount: z.number().int().min(0).optional(),
  priceLevel: z.enum(PRICE_LEVELS).optional(),
  /** `undefined` = unknown. Never coerce unknown to `false`. */
  openNow: z.boolean().optional(),
  businessStatus: z.enum(BUSINESS_STATUSES).optional(),
  /** Official Google Maps link for the place (allowlisted hosts only). */
  googleMapsUri: z.url({ protocol: /^https$/ }).optional(),
  /** Straight-line distance from the search origin, derived by Cafe Finder. */
  distanceMeters: z.number().min(0).optional(),
  dataSource: z.enum(DATA_SOURCES),
});

export type CafePlace = z.infer<typeof cafePlaceSchema>;

export const excludedCountsSchema = z.strictObject({
  belowMinRating: z.number().int().min(0),
  closedNow: z.number().int().min(0),
  permanentlyClosed: z.number().int().min(0),
});

export type ExcludedCounts = z.infer<typeof excludedCountsSchema>;

export const COVERAGE_NOTE =
  "Results are a subset of nearby cafes, not an exhaustive list.";

/** Third-party data providers Google requires us to credit next to its data. */
export const dataProviderAttributionSchema = z.strictObject({
  provider: z.string().min(1),
  providerUri: z.url({ protocol: /^https?$/ }).optional(),
});

export type DataProviderAttribution = z.infer<typeof dataProviderAttributionSchema>;


/** Matches Google place IDs and fixture IDs without excluding legitimate characters. */
export const PLACE_ID_PATTERN = /^[A-Za-z0-9_-]{1,512}$/;

/**
 * Photo resource name, e.g. `places/{placeId}/photos/{photoRef}`. Opaque,
 * short-lived and never persisted (Google: photo names can't be cached).
 */
export const PHOTO_NAME_PATTERN =
  /^places\/[A-Za-z0-9_-]{1,512}\/photos\/[A-Za-z0-9_-]{1,2048}$/;

export const photoAuthorAttributionSchema = z.strictObject({
  displayName: z.string().min(1),
  uri: z.url({ protocol: /^https$/ }).optional(),
});

export const placePhotoSchema = z.strictObject({
  name: z.string().regex(PHOTO_NAME_PATTERN),
  widthPx: z.number().int().positive().optional(),
  heightPx: z.number().int().positive().optional(),
  /** Must be displayed wherever the photo is shown (may be empty). */
  authorAttributions: z.array(photoAuthorAttributionSchema),
});

export type PlacePhoto = z.infer<typeof placePhotoSchema>;

/** Max photos returned per place; each one shown costs a Place Photo request. */
export const MAX_DETAIL_PHOTOS = 5;

/** Google returns at most 5 reviews per place. */
export const MAX_REVIEWS = 5;

/**
 * Google-reported attributes shown on the details page. `true`/`false` are
 * Google's answer; a missing key means Google doesn't list it (unknown).
 * Wi-Fi and noise level are not Google fields at all.
 */
export const AMENITY_KEYS = [
  "dineIn",
  "takeout",
  "delivery",
  "outdoorSeating",
  "goodForGroups",
  "goodForChildren",
  "reservable",
  "restroom",
  "servesBreakfast",
  "servesCoffee",
  "servesDessert",
  "servesVegetarianFood",
  "allowsDogs",
  "liveMusic",
  "wheelchairAccessibleEntrance",
  "wheelchairAccessibleSeating",
  "acceptsCreditCards",
  "acceptsNfc",
  "acceptsCashOnly",
] as const;
export type AmenityKey = (typeof AMENITY_KEYS)[number];

export const amenitiesSchema = z.partialRecord(z.enum(AMENITY_KEYS), z.boolean());
export type Amenities = z.infer<typeof amenitiesSchema>;

/**
 * A Google review, displayed as provided with mandatory author attribution.
 * Never stored, never mixed with Cafe Finder community content.
 */
export const placeReviewSchema = z.strictObject({
  authorName: z.string().min(1),
  authorUri: z.url({ protocol: /^https$/ }).optional(),
  authorPhotoUri: z.url({ protocol: /^https$/ }).optional(),
  rating: z.number().min(1).max(5).optional(),
  relativePublishTime: z.string().optional(),
  publishTime: z.iso.datetime().optional(),
  text: z.string().optional(),
  /** True when Google translated the text from another language. */
  translated: z.boolean(),
  googleMapsUri: z.url({ protocol: /^https$/ }).optional(),
});
export type PlaceReview = z.infer<typeof placeReviewSchema>;

export const cafeDetailsSchema = cafePlaceSchema.extend({
  /** Human-readable weekly hours as provided by the source, in the place's local time. */
  weekdayDescriptions: z.array(z.string()).max(7).optional(),
  utcOffsetMinutes: z.number().int().optional(),
  websiteUri: z.url({ protocol: /^https?$/ }).optional(),
  phoneNumber: z.string().max(64).optional(),
  photos: z.array(placePhotoSchema).max(MAX_DETAIL_PHOTOS),
  reviews: z.array(placeReviewSchema).max(MAX_REVIEWS),
  amenities: amenitiesSchema,
});

export type CafeDetails = z.infer<typeof cafeDetailsSchema>;

/** What the favorites list shows for a saved place ID (refetched, never stored). */
export const placeSummarySchema = cafePlaceSchema.pick({
  placeId: true,
  name: true,
  address: true,
  latitude: true,
  longitude: true,
  googleMapsUri: true,
  businessStatus: true,
  dataSource: true,
});

export type PlaceSummary = z.infer<typeof placeSummarySchema>;

export const placeDetailsResponseSchema = z.strictObject({
  place: cafeDetailsSchema,
  fetchedAt: z.iso.datetime(),
  source: z.enum(DATA_SOURCES),
  attributions: z.array(dataProviderAttributionSchema),
});

export type PlaceDetailsResponse = z.infer<typeof placeDetailsResponseSchema>;
