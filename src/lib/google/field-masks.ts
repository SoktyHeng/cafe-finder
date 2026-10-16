/**
 * Explicit Places API (New) field masks. Billing follows the highest SKU
 * among requested fields (verified against Google docs on 2026-10-16):
 *
 * - Pro: id, displayName, location, shortFormattedAddress, formattedAddress,
 *   businessStatus, googleMapsUri, attributions, photos, utcOffsetMinutes
 * - Enterprise: rating, userRatingCount, priceLevel, currentOpeningHours,
 *   websiteUri, nationalPhoneNumber
 *
 * Both masks are therefore billed as Enterprise. Rating and open-now are
 * product requirements (filters), so Enterprise is the floor. Atmosphere
 * fields (reviews, servesCoffee, ...) are deliberately excluded.
 * Never use "*". Changing a mask can change the SKU, so update
 * docs/google-maps-compliance.md and the tests with it.
 */

const NEARBY_PLACE_FIELDS = [
  "id",
  "displayName",
  "location",
  "shortFormattedAddress",
  "businessStatus",
  "googleMapsUri",
  "attributions",
  "rating",
  "userRatingCount",
  "priceLevel",
  "currentOpeningHours",
] as const;

/** Nearby Search response fields are nested under `places.`. */
export const NEARBY_SEARCH_FIELD_MASK = NEARBY_PLACE_FIELDS.map(
  (field) => `places.${field}`,
).join(",");

export const PLACE_DETAILS_FIELD_MASK = [
  "id",
  "displayName",
  "location",
  "formattedAddress",
  "businessStatus",
  "googleMapsUri",
  "attributions",
  "photos",
  "utcOffsetMinutes",
  "rating",
  "userRatingCount",
  "priceLevel",
  "currentOpeningHours",
  "websiteUri",
  "nationalPhoneNumber",
].join(",");

export const FIELD_MASK_SKU = {
  nearbySearch: "Nearby Search Enterprise",
  placeDetails: "Place Details Enterprise",
  placePhoto: "Place Photo",
} as const;
