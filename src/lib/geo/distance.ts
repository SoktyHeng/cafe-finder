export type Coordinates = {
  latitude: number;
  longitude: number;
};

/** Mean Earth radius (IUGG), in meters. */
const EARTH_RADIUS_METERS = 6_371_008.8;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/** Great-circle ("straight-line") distance in meters. Not a travel distance. */
export function haversineMeters(from: Coordinates, to: Coordinates): number {
  const dLat = toRadians(to.latitude - from.latitude);
  const dLng = toRadians(to.longitude - from.longitude);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(from.latitude)) *
      Math.cos(toRadians(to.latitude)) *
      Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Coordinate precision used in URLs and requests. Three decimals is about
 * 110 m of latitude, enough for a cafe search without exposing an exact position.
 */
export const COORDINATE_DECIMALS = 3;

export function roundCoordinate(value: number): number {
  const factor = 10 ** COORDINATE_DECIMALS;
  return Math.round(value * factor) / factor;
}
