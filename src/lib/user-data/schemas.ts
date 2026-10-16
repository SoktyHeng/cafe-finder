import { z } from "zod";

import { BUDGETS, PURPOSES, RADIUS_METERS, RATING_LIMITS } from "@/lib/discovery/request-schema";
import { PLACE_ID_PATTERN } from "@/lib/places/schemas";

/** API contracts for first-party user data (mirrors the M5 migration's constraints). */

export const MAX_NOTES_LENGTH = 500;
/** Typed by the user to confirm account deletion. */
export const ACCOUNT_DELETION_CONFIRMATION = "delete my account";
export const MAX_DISPLAY_NAME_LENGTH = 80;

export const placeIdSchema = z.string().regex(PLACE_ID_PATTERN, "Invalid place ID");

const notesSchema = z
  .string()
  .trim()
  .max(MAX_NOTES_LENGTH)
  .transform((value) => (value === "" ? null : value))
  .nullable();

export const favoriteInputSchema = z.strictObject({
  placeId: placeIdSchema,
  notes: notesSchema.optional(),
});

export const favoriteNotesSchema = z.strictObject({
  placeId: placeIdSchema,
  notes: notesSchema,
});

export const favoriteSchema = z.strictObject({
  placeId: z.string(),
  notes: z.string().nullable(),
  createdAt: z.string(),
});
export type Favorite = z.infer<typeof favoriteSchema>;

export const favoritesResponseSchema = z.strictObject({ favorites: z.array(favoriteSchema) });

export const visitSchema = z.strictObject({
  placeId: z.string(),
  visitDate: z.string().nullable(),
  createdAt: z.string(),
});
export type Visit = z.infer<typeof visitSchema>;

export const visitsResponseSchema = z.strictObject({ visits: z.array(visitSchema) });

export const visitInputSchema = z.strictObject({ placeId: placeIdSchema });

/** Saved defaults for the discovery form. */
export const preferencesSchema = z.strictObject({
  purpose: z.enum(PURPOSES),
  radiusMeters: z.number().int().min(RADIUS_METERS.min).max(RADIUS_METERS.max),
  minRating: z.number().min(RATING_LIMITS.min).max(RATING_LIMITS.max).multipleOf(0.1).nullable(),
  openNowOnly: z.boolean(),
  budget: z.enum(BUDGETS),
  preferQuiet: z.boolean(),
  preferWifi: z.boolean(),
});
export type Preferences = z.infer<typeof preferencesSchema>;

export const DEFAULT_PREFERENCES: Preferences = {
  purpose: "work",
  radiusMeters: RADIUS_METERS.default,
  minRating: null,
  openNowOnly: false,
  budget: "any",
  preferQuiet: false,
  preferWifi: false,
};

export const preferencesResponseSchema = z.strictObject({ preferences: preferencesSchema });

export const profileInputSchema = z.strictObject({
  displayName: z
    .string()
    .trim()
    .max(MAX_DISPLAY_NAME_LENGTH)
    .transform((value) => (value === "" ? null : value))
    .nullable(),
});

export const profileSchema = z.strictObject({
  displayName: z.string().nullable(),
  email: z.string().nullable(),
});
export type Profile = z.infer<typeof profileSchema>;

export const profileResponseSchema = z.strictObject({ profile: profileSchema });
