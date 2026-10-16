import type { CafePlace, PlaceSummary } from "./schemas";

/** Keeps only the summary fields that are present (unknown stays absent). */
export function toPlaceSummary(cafe: CafePlace): PlaceSummary {
  const { placeId, name, address, latitude, longitude, googleMapsUri, businessStatus, dataSource } = cafe;
  return {
    placeId,
    ...(name !== undefined && { name }),
    ...(address !== undefined && { address }),
    ...(latitude !== undefined && longitude !== undefined && { latitude, longitude }),
    ...(googleMapsUri !== undefined && { googleMapsUri }),
    ...(businessStatus !== undefined && { businessStatus }),
    dataSource,
  };
}
