import { haversineMeters } from "@/lib/geo/distance";

import { FIXTURE_CAFES } from "./fixture-data";
import {
  MAX_NEARBY_RESULTS,
  type NearbySearchParams,
  type NearbySearchResult,
  type PhotoWidth,
  type PlaceDetailsResult,
  type PlacesProvider,
} from "./provider";
import type { CafePlace } from "./schemas";

/**
 * Deterministic offline provider backed by fictional demo cafes. It mimics a
 * circular location restriction and the per-request result cap. Fixtures have
 * no photos, hours, website or phone, so nothing is invented for details.
 */
export class FixturePlacesProvider implements PlacesProvider {
  readonly source = "fixture" as const;

  constructor(private readonly cafes: readonly CafePlace[] = FIXTURE_CAFES) {}

  async searchNearby({
    center,
    radiusMeters,
  }: NearbySearchParams): Promise<NearbySearchResult> {
    const places = this.cafes
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
    return { places, attributions: [] };
  }

  async getPlaceDetails(placeId: string): Promise<PlaceDetailsResult | null> {
    const cafe = this.cafes.find((candidate) => candidate.placeId === placeId);
    return cafe
      ? { place: { ...cafe, photos: [], reviews: [], amenities: {} }, attributions: [] }
      : null;
  }

  async getPhotoUrl(_photoName: string, _maxWidthPx: PhotoWidth): Promise<string | null> {
    void _photoName;
    void _maxWidthPx;
    return null;
  }
}
