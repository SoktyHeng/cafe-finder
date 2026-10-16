import type { Coordinates } from "@/lib/geo/distance";

export type BoundsLiteral = { north: number; south: number; east: number; west: number };

/**
 * Bounding box around the search origin and all markers, or `undefined` when
 * there is only one point (then the map centres on it instead).
 */
export function boundsFor(points: readonly Coordinates[]): BoundsLiteral | undefined {
  if (points.length < 2) return undefined;
  let north = -90;
  let south = 90;
  let east = -180;
  let west = 180;
  for (const { latitude, longitude } of points) {
    north = Math.max(north, latitude);
    south = Math.min(south, latitude);
    east = Math.max(east, longitude);
    west = Math.min(west, longitude);
  }
  return north === south && east === west ? undefined : { north, south, east, west };
}

/** Stable DOM id for a result card, so map selections can scroll to it. */
export function cafeCardDomId(placeId: string): string {
  // Place IDs are validated to [A-Za-z0-9_-], which is safe in an id.
  return `cafe-card-${placeId}`;
}
