import { haversineMeters } from "@/lib/geo/distance";

import { FIXTURE_CAFES } from "./fixture-data";
import {
  MAX_NEARBY_RESULTS,
  type NearbySearchParams,
  type PlacesProvider,
} from "./provider";
import type { CafePlace } from "./schemas";

/**
 * Deterministic offline provider backed by fictional demo cafes. It mimics a
 * circular location restriction and the per-request result cap.
 */
export class FixturePlacesProvider implements PlacesProvider {
  readonly source = "fixture" as const;

  constructor(
    private readonly cafes: readonly CafePlace[] = FIXTURE_CAFES,
  ) {}

  async searchNearby({
    center,
    radiusMeters,
  }: NearbySearchParams): Promise<CafePlace[]> {
    return this.cafes
      .filter(
        (cafe) =>
          cafe.latitude !== undefined &&
          cafe.longitude !== undefined &&
          haversineMeters(center, {
            latitude: cafe.latitude,
            longitude: cafe.longitude,
          }) <= radiusMeters,
      )
      .slice(0, MAX_NEARBY_RESULTS)
      .map((cafe) => ({ ...cafe }));
  }
}
