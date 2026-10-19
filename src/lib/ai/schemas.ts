import { z } from "zod";

import { BUDGETS, PURPOSES, discoveryRequestSchema } from "@/lib/discovery/request-schema";
import { nearbySearchResponseSchema } from "@/lib/discovery/response-schema";
import { DEFAULT_CITY } from "@/lib/locations/cities";
import { preferencesSchema } from "@/lib/user-data/schemas";

export const MAX_MESSAGE_LENGTH = 1000;
export const MAX_HISTORY_MESSAGES = 6;
export const areaIds = DEFAULT_CITY.areas.map((area) => area.id);
const messageSchema = z.string().trim().min(1).max(MAX_MESSAGE_LENGTH);

export const assistantLocationSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("area"), areaId: z.enum(areaIds) }),
  z.strictObject({ kind: z.literal("device"), latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) }),
]);
export type AssistantLocation = z.infer<typeof assistantLocationSchema>;

export const assistantRequestSchema = z.strictObject({
  message: messageSchema,
  history: z.array(messageSchema).max(MAX_HISTORY_MESSAGES).default([]),
  preferences: preferencesSchema.optional(),
  location: assistantLocationSchema.nullable().default(null),
});
export type AssistantRequest = z.infer<typeof assistantRequestSchema>;

/** Null means leave the current setting alone; false/any explicitly remove a preference. */
export const intentSchema = z.strictObject({
  action: z.enum(["search", "clarify", "unsupported"]),
  locationMode: z.enum(["unchanged", "current", "area", "unsupported"]),
  areaId: z.enum(areaIds).nullable(),
  purpose: z.enum(PURPOSES).nullable(),
  radiusMeters: z.number().int().min(1000).max(15000).nullable(),
  minRating: z.number().min(0).max(5).nullable(),
  clearMinRating: z.boolean(),
  openNowOnly: z.boolean().nullable(),
  budget: z.enum(BUDGETS).nullable(),
  preferQuiet: z.boolean().nullable(),
  preferWifi: z.boolean().nullable(),
  unsupportedFilters: z.boolean(),
});
export type SearchIntent = z.infer<typeof intentSchema>;

export const assistantResponseSchema = z.strictObject({
  status: z.enum(["ready", "clarify", "unsupported"]),
  message: z.string().max(1000),
  provider: z.enum(["openai", "nvidia", "fixture"]),
  preferences: preferencesSchema,
  location: assistantLocationSchema.nullable(),
  locationLabel: z.string().nullable(),
  filters: discoveryRequestSchema.nullable(),
  notices: z.array(z.string()),
  results: nearbySearchResponseSchema.nullable(),
});
export type AssistantResponse = z.infer<typeof assistantResponseSchema>;
