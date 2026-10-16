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

export const nearbySearchResponseSchema = z.strictObject({
  results: z.array(cafePlaceSchema),
  searchedAt: z.iso.datetime(),
  source: z.enum(DATA_SOURCES),
  coverageNote: z.string(),
  /** How many candidates the hard filters removed, so empty states can explain why. */
  excluded: excludedCountsSchema,
});

export type NearbySearchResponse = z.infer<typeof nearbySearchResponseSchema>;
