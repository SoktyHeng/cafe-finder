import { z } from "zod";

/**
 * Tolerant schemas for the subset of Places API (New) responses we request.
 * Unknown keys are ignored (non-strict) so additive API changes don't break
 * us. Each place is validated individually by the normalizer.
 */

export const googleLocalizedTextSchema = z.object({
  text: z.string(),
  languageCode: z.string().optional(),
});

export const googleAttributionSchema = z.object({
  provider: z.string().optional(),
  providerUri: z.string().optional(),
});

export const googleAuthorAttributionSchema = z.object({
  displayName: z.string().optional(),
  uri: z.string().optional(),
  photoUri: z.string().optional(),
});

export const googlePhotoSchema = z.object({
  name: z.string(),
  widthPx: z.number().optional(),
  heightPx: z.number().optional(),
  authorAttributions: z.array(googleAuthorAttributionSchema).optional(),
});

export const googleOpeningHoursSchema = z.object({
  openNow: z.boolean().optional(),
  weekdayDescriptions: z.array(z.string()).optional(),
});

export const googleReviewSchema = z.object({
  rating: z.number().optional(),
  relativePublishTimeDescription: z.string().optional(),
  publishTime: z.string().optional(),
  text: googleLocalizedTextSchema.optional(),
  originalText: googleLocalizedTextSchema.optional(),
  authorAttribution: googleAuthorAttributionSchema.optional(),
  googleMapsUri: z.string().optional(),
  flagContentUri: z.string().optional(),
});

export const GOOGLE_AMENITY_FIELDS = [
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
] as const;

const optionalBoolean = z.boolean().optional();

export const googlePlaceSchema = z.object({
  id: z.string(),
  displayName: googleLocalizedTextSchema.optional(),
  location: z.object({ latitude: z.number(), longitude: z.number() }).optional(),
  formattedAddress: z.string().optional(),
  shortFormattedAddress: z.string().optional(),
  businessStatus: z.string().optional(),
  googleMapsUri: z.string().optional(),
  attributions: z.array(googleAttributionSchema).optional(),
  photos: z.array(googlePhotoSchema).optional(),
  utcOffsetMinutes: z.number().optional(),
  rating: z.number().optional(),
  userRatingCount: z.number().optional(),
  priceLevel: z.string().optional(),
  currentOpeningHours: googleOpeningHoursSchema.optional(),
  websiteUri: z.string().optional(),
  nationalPhoneNumber: z.string().optional(),
  reviews: z.array(z.unknown()).optional(),
  accessibilityOptions: z
    .object({ wheelchairAccessibleEntrance: optionalBoolean, wheelchairAccessibleSeating: optionalBoolean })
    .optional(),
  paymentOptions: z
    .object({ acceptsCreditCards: optionalBoolean, acceptsNfc: optionalBoolean, acceptsCashOnly: optionalBoolean })
    .optional(),
  dineIn: optionalBoolean,
  takeout: optionalBoolean,
  delivery: optionalBoolean,
  outdoorSeating: optionalBoolean,
  goodForGroups: optionalBoolean,
  goodForChildren: optionalBoolean,
  reservable: optionalBoolean,
  restroom: optionalBoolean,
  servesBreakfast: optionalBoolean,
  servesCoffee: optionalBoolean,
  servesDessert: optionalBoolean,
  servesVegetarianFood: optionalBoolean,
  allowsDogs: optionalBoolean,
  liveMusic: optionalBoolean,
});

export type GooglePlace = z.infer<typeof googlePlaceSchema>;

/** `places` is omitted entirely when nothing matches. */
export const googleNearbyResponseSchema = z.object({
  places: z.array(z.unknown()).optional(),
});

export const googlePhotoMediaResponseSchema = z.object({
  name: z.string().optional(),
  photoUri: z.string(),
});

export const googleErrorBodySchema = z.object({
  error: z.object({
    code: z.number().optional(),
    status: z.string().optional(),
    /** google.rpc.ErrorInfo entries carry a machine-readable `reason`. */
    details: z.array(z.object({ reason: z.string().optional() }).loose()).optional(),
  }),
});
