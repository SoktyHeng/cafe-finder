import type { CafePlace } from "@/lib/places/schemas";

/**
 * Official Google Maps URLs (https://developers.google.com/maps/documentation/urls).
 * No API key, no billing. Safe for the browser.
 */
const DIRECTIONS_BASE = "https://www.google.com/maps/dir/";

/**
 * Directions to a cafe. Google requires `destination` whenever
 * `destination_place_id` is set; the origin is left to Google Maps (the
 * device's location), so Cafe Finder never puts the user's position in the URL.
 *
 * Returns `undefined` for demo cafes: their coordinates are fictional, and a
 * link would send people to a real place that isn't that cafe.
 */
export function directionsUrl(
  cafe: Pick<CafePlace, "placeId" | "name" | "latitude" | "longitude" | "dataSource">,
): string | undefined {
  if (cafe.dataSource !== "google") return undefined;
  const destination =
    cafe.name ??
    (cafe.latitude !== undefined && cafe.longitude !== undefined
      ? `${cafe.latitude},${cafe.longitude}`
      : undefined);
  if (!destination) return undefined;

  const url = new URL(DIRECTIONS_BASE);
  url.searchParams.set("api", "1");
  url.searchParams.set("destination", destination);
  url.searchParams.set("destination_place_id", cafe.placeId);
  return url.toString();
}
