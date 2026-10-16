import { z } from "zod";

import {
  DATA_SOURCES,
  dataProviderAttributionSchema,
  excludedCountsSchema,
} from "@/lib/places/schemas";
import { recommendationSchema } from "@/lib/recommendation/schemas";

/** `POST /api/places/nearby` response (see docs/api-contracts.md). */
export const nearbySearchResponseSchema = z.strictObject({
  /** Ranked best match first. */
  results: z.array(recommendationSchema),
  searchedAt: z.iso.datetime(),
  source: z.enum(DATA_SOURCES),
  coverageNote: z.string(),
  /** How many candidates the hard filters removed, so empty states can explain why. */
  excluded: excludedCountsSchema,
  attributions: z.array(dataProviderAttributionSchema),
});

export type NearbySearchResponse = z.infer<typeof nearbySearchResponseSchema>;
