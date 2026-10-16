import { roundCoordinate } from "@/lib/geo/distance";
import type { SearchArea } from "@/lib/locations/cities";
import {
  RADIUS_METERS,
  type Budget,
  type DiscoveryRequest,
  type Purpose,
} from "@/lib/discovery/request-schema";

export type LocationChoice =
  | {
      kind: "area";
      areaId: string;
      label: string;
      latitude: number;
      longitude: number;
    }
  | {
      kind: "device";
      label: string;
      latitude: number;
      longitude: number;
      /** Reported accuracy radius, when the browser provides one. */
      accuracyMeters?: number;
    };

export type DiscoveryFormValues = {
  location: LocationChoice | null;
  purpose: Purpose;
  radiusMeters: number;
  minRating: number | undefined;
  openNowOnly: boolean;
  budget: Budget;
  preferQuiet: boolean;
  preferWifi: boolean;
};

export type ReadyFormValues = DiscoveryFormValues & { location: LocationChoice };

export const DEFAULT_FORM_VALUES: DiscoveryFormValues = {
  location: null,
  purpose: "work",
  radiusMeters: RADIUS_METERS.default,
  minRating: undefined,
  openNowOnly: false,
  budget: "any",
  preferQuiet: false,
  preferWifi: false,
};

export const DEVICE_LOCATION_LABEL = "your current location";

export function areaLocation(area: SearchArea): LocationChoice {
  return {
    kind: "area",
    areaId: area.id,
    label: area.name,
    latitude: area.latitude,
    longitude: area.longitude,
  };
}

/** Device positions are rounded (about 100 m) before they leave this module. */
export function deviceLocation(position: {
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
}): LocationChoice {
  return {
    kind: "device",
    label: DEVICE_LOCATION_LABEL,
    latitude: roundCoordinate(position.latitude),
    longitude: roundCoordinate(position.longitude),
    accuracyMeters: position.accuracyMeters,
  };
}

export function isReady(values: DiscoveryFormValues): values is ReadyFormValues {
  return values.location !== null;
}

/** Builds the API request, omitting defaults so payloads stay minimal. */
export function toDiscoveryRequest(values: ReadyFormValues): DiscoveryRequest {
  return {
    latitude: values.location.latitude,
    longitude: values.location.longitude,
    radiusMeters: values.radiusMeters,
    purpose: values.purpose,
    ...(values.minRating !== undefined && { minRating: values.minRating }),
    ...(values.openNowOnly && { openNowOnly: true }),
    ...(values.budget !== "any" && { budget: values.budget }),
    ...(values.preferQuiet && { preferQuiet: true }),
    ...(values.preferWifi && { preferWifi: true }),
  };
}
