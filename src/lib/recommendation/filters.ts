import { haversineMeters, type Coordinates } from "@/lib/geo/distance";
import type { DiscoveryRequest } from "@/lib/discovery/request-schema";
import type { CafePlace, ExcludedCounts } from "@/lib/places/schemas";

export type HardFilterInput = Pick<DiscoveryRequest, "minRating" | "openNowOnly">;

export type HardFilterResult = {
  kept: CafePlace[];
  excluded: ExcludedCounts;
};

/**
 * Removes only candidates with positive evidence of a mismatch.
 *
 * - Permanently closed places are always removed.
 * - `minRating`: a rating below the threshold removes the cafe. An unrated
 *   cafe is kept, because "no rating" is not "low rating". The UI labels it.
 * - `openNowOnly`: `openNow === false` removes the cafe. Unknown hours are
 *   kept and labelled, never treated as closed.
 *
 * Unverifiable preferences (budget, Wi-Fi, quiet, purpose) never filter.
 */
export function applyHardFilters(
  cafes: readonly CafePlace[],
  { minRating, openNowOnly }: HardFilterInput,
): HardFilterResult {
  const excluded: ExcludedCounts = {
    belowMinRating: 0,
    closedNow: 0,
    permanentlyClosed: 0,
  };
  const kept: CafePlace[] = [];

  for (const cafe of cafes) {
    if (cafe.businessStatus === "closed_permanently") {
      excluded.permanentlyClosed += 1;
    } else if (
      minRating !== undefined &&
      cafe.rating !== undefined &&
      cafe.rating < minRating
    ) {
      excluded.belowMinRating += 1;
    } else if (openNowOnly === true && cafe.openNow === false) {
      excluded.closedNow += 1;
    } else {
      kept.push(cafe);
    }
  }

  return { kept, excluded };
}

/** Adds straight-line distance where the cafe's coordinates are known. */
export function withDistance(
  cafes: readonly CafePlace[],
  origin: Coordinates,
): CafePlace[] {
  return cafes.map((cafe) =>
    cafe.latitude !== undefined && cafe.longitude !== undefined
      ? {
          ...cafe,
          distanceMeters: Math.round(
            haversineMeters(origin, {
              latitude: cafe.latitude,
              longitude: cafe.longitude,
            }),
          ),
        }
      : cafe,
  );
}

/**
 * Interim deterministic order until M3 ranking: nearest first, unknown
 * distance last, ties broken by place ID.
 */
export function orderByDistance(cafes: readonly CafePlace[]): CafePlace[] {
  return [...cafes].sort((a, b) => {
    const da = a.distanceMeters ?? Number.POSITIVE_INFINITY;
    const db = b.distanceMeters ?? Number.POSITIVE_INFINITY;
    if (da !== db) {
      return da < db ? -1 : 1;
    }
    return a.placeId < b.placeId ? -1 : a.placeId > b.placeId ? 1 : 0;
  });
}
