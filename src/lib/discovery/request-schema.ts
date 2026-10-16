import { z } from "zod";

import { SEARCH_RADIUS_LIMITS } from "@/lib/config/env-schema";

/** Discovery request contract (CLAUDE.md §7.1), shared by client and server. */

export const PURPOSES = ["work", "relax", "friends", "date"] as const;
export type Purpose = (typeof PURPOSES)[number];

/** USD tiers for Cambodia. A user preference, not a verified menu price. */
export const BUDGETS = ["any", "under_5", "5_to_10", "over_10"] as const;
export type Budget = (typeof BUDGETS)[number];

export const RADIUS_METERS = {
  min: SEARCH_RADIUS_LIMITS.minMeters,
  max: SEARCH_RADIUS_LIMITS.maxMeters,
  default: 3_000,
  step: 1_000,
} as const;

export const RATING_LIMITS = { min: 0, max: 5 } as const;

export const discoveryRequestSchema = z.strictObject({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  radiusMeters: z.number().int().min(RADIUS_METERS.min).max(RADIUS_METERS.max),
  purpose: z.enum(PURPOSES),
  minRating: z.number().min(RATING_LIMITS.min).max(RATING_LIMITS.max).optional(),
  openNowOnly: z.boolean().optional(),
  budget: z.enum(BUDGETS).optional(),
  preferQuiet: z.boolean().optional(),
  preferWifi: z.boolean().optional(),
});

export type DiscoveryRequest = z.infer<typeof discoveryRequestSchema>;
