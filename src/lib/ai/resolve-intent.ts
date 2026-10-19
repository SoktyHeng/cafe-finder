import { discoveryRequestSchema } from "@/lib/discovery/request-schema";
import { roundCoordinate } from "@/lib/geo/distance";
import { findAreaById } from "@/lib/locations/cities";
import type { Preferences } from "@/lib/user-data/schemas";
import { preferencesSchema } from "@/lib/user-data/schemas";
import type { AssistantLocation, SearchIntent } from "./schemas";

/** Pure, deterministic merge: the model never provides coordinates, cafes, prose, or scores. */
export function resolveIntent(intent: SearchIntent, defaults: Preferences, selected: AssistantLocation | null, maxRadius: number) {
  const preferences = preferencesSchema.parse({
    purpose: intent.purpose ?? defaults.purpose,
    radiusMeters: Math.min(intent.radiusMeters ?? defaults.radiusMeters, maxRadius),
    minRating: intent.clearMinRating ? null : intent.minRating ?? defaults.minRating,
    openNowOnly: intent.openNowOnly ?? defaults.openNowOnly,
    budget: intent.budget ?? defaults.budget,
    preferQuiet: intent.preferQuiet ?? defaults.preferQuiet,
    preferWifi: intent.preferWifi ?? defaults.preferWifi,
  });
  let location = selected;
  if (intent.locationMode === "area") {
    location = intent.areaId ? { kind: "area", areaId: intent.areaId } : null;
  } else if (intent.locationMode === "current" && selected?.kind !== "device") {
    location = null;
  } else if (intent.locationMode === "unsupported") {
    location = null;
  }
  const area = location?.kind === "area" ? findAreaById(location.areaId) : undefined;
  const coordinates = location?.kind === "device"
    ? { latitude: roundCoordinate(location.latitude), longitude: roundCoordinate(location.longitude) }
    : area;
  if (location?.kind === "device" && coordinates) location = { kind: "device", latitude: coordinates.latitude, longitude: coordinates.longitude };
  const locationLabel = area?.name ?? (location?.kind === "device" ? "your current location" : null);
  const filters = coordinates ? discoveryRequestSchema.parse({
    latitude: coordinates.latitude, longitude: coordinates.longitude, ...preferences,
    minRating: preferences.minRating ?? undefined,
  }) : null;
  const notices: string[] = [];
  if (preferences.preferQuiet || preferences.preferWifi) notices.push("Wi-Fi and quietness need sufficient approved member reports. Unknown amenities stay unverified and count as neutral.");
  if (preferences.budget !== "any") notices.push("Your budget is a preference, not a guaranteed menu price. Google price levels are qualitative; confirm prices with the cafe.");
  if (intent.unsupportedFilters) notices.push("Some requested details are not supported filters. Check each cafe's actual data; no unsupported amenities or prices have been assumed.");
  if ((intent.radiusMeters ?? defaults.radiusMeters) > maxRadius) notices.push(`The search radius is limited to ${maxRadius / 1000} km.`);
  return { preferences, location, locationLabel, filters, notices };
}
