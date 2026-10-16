import type { Coordinates } from "@/lib/geo/distance";

import type {
  CafeDetails,
  CafePlace,
  DataProviderAttribution,
  DataSource,
  PlaceSummary,
} from "./schemas";

/** Nearby Search (New) caps results per request; results are never exhaustive. */
export const MAX_NEARBY_RESULTS = 20;

/** Allowed photo widths. A small fixed set keeps requests and costs predictable. */
export const PHOTO_WIDTHS = [200, 400, 800] as const;
export type PhotoWidth = (typeof PHOTO_WIDTHS)[number];

export type NearbySearchParams = {
  center: Coordinates;
  radiusMeters: number;
};

export type NearbySearchResult = {
  places: CafePlace[];
  attributions: DataProviderAttribution[];
};

export type PlaceDetailsResult = {
  place: CafeDetails;
  attributions: DataProviderAttribution[];
};

/**
 * Vendor-neutral place source. UI, route handlers and ranking depend on this
 * contract and the normalized DTOs, never on vendor response shapes.
 */
export interface PlacesProvider {
  readonly source: DataSource;
  searchNearby(params: NearbySearchParams): Promise<NearbySearchResult>;
  /** `null` when the place does not exist (or no longer exists). */
  getPlaceDetails(placeId: string): Promise<PlaceDetailsResult | null>;
  /** Name/address/location only, for listing saved places cheaply. `null` if gone. */
  getPlaceSummary(placeId: string): Promise<PlaceSummary | null>;
  /**
   * A short-lived image URL for a photo name previously returned by this
   * provider, or `null` if the photo is unknown or expired.
   */
  getPhotoUrl(photoName: string, maxWidthPx: PhotoWidth): Promise<string | null>;
}

/** The configured provider cannot serve requests (missing, disabled, down, over quota). */
export class PlacesProviderUnavailableError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "PlacesProviderUnavailableError";
  }
}
