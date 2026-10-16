import type { Coordinates } from "@/lib/geo/distance";

import type { CafePlace, DataSource } from "./schemas";

/** Nearby Search (New) caps results per request; results are never exhaustive. */
export const MAX_NEARBY_RESULTS = 20;

export type NearbySearchParams = {
  center: Coordinates;
  radiusMeters: number;
};

/**
 * Vendor-neutral place source. UI, route handlers and ranking depend on this
 * contract and the normalized `CafePlace` DTO, never on vendor response shapes.
 */
export interface PlacesProvider {
  readonly source: DataSource;
  searchNearby(params: NearbySearchParams): Promise<CafePlace[]>;
}

/** The configured provider cannot serve requests (missing, disabled, down). */
export class PlacesProviderUnavailableError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "PlacesProviderUnavailableError";
  }
}
