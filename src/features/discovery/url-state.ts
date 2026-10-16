import { roundCoordinate } from "@/lib/geo/distance";
import { findAreaById } from "@/lib/locations/cities";
import {
  BUDGETS,
  PURPOSES,
  discoveryRequestSchema,
  type Budget,
  type Purpose,
} from "@/lib/discovery/request-schema";

import {
  DEFAULT_FORM_VALUES,
  DEVICE_LOCATION_LABEL,
  areaLocation,
  type DiscoveryFormValues,
  type LocationChoice,
  type ReadyFormValues,
} from "./form-state";

/**
 * Search state lives in the URL so results can be bookmarked and the back
 * button works. Device coordinates are already rounded to about 100 m.
 * Manual areas are stored by ID only.
 */
export const PARAM = {
  area: "area",
  latitude: "lat",
  longitude: "lng",
  purpose: "purpose",
  radius: "radius",
  minRating: "rating",
  openNow: "open",
  budget: "budget",
  quiet: "quiet",
  wifi: "wifi",
} as const;

const FLAG_ON = "1";

export function formValuesToSearchParams(values: ReadyFormValues): URLSearchParams {
  const params = new URLSearchParams();
  const { location } = values;
  if (location.kind === "area") {
    params.set(PARAM.area, location.areaId);
  } else {
    params.set(PARAM.latitude, String(roundCoordinate(location.latitude)));
    params.set(PARAM.longitude, String(roundCoordinate(location.longitude)));
  }
  params.set(PARAM.purpose, values.purpose);
  params.set(PARAM.radius, String(values.radiusMeters));
  if (values.minRating !== undefined) {
    params.set(PARAM.minRating, String(values.minRating));
  }
  if (values.openNowOnly) params.set(PARAM.openNow, FLAG_ON);
  if (values.budget !== "any") params.set(PARAM.budget, values.budget);
  if (values.preferQuiet) params.set(PARAM.quiet, FLAG_ON);
  if (values.preferWifi) params.set(PARAM.wifi, FLAG_ON);
  return params;
}

export type ParsedSearchParams =
  /** No search in the URL yet. */
  | { status: "empty"; values: DiscoveryFormValues }
  /** Some parameters were malformed; valid ones are kept, the rest reset. */
  | { status: "invalid"; values: DiscoveryFormValues; invalidParams: string[] }
  | { status: "ready"; values: ReadyFormValues };

type Reader = Pick<URLSearchParams, "get" | "has">;

const DECIMAL = /^-?\d{1,3}(\.\d+)?$/;
const INTEGER = /^\d{1,6}$/;

function parseNumber(raw: string | null, pattern: RegExp): number | undefined {
  return raw !== null && pattern.test(raw) ? Number(raw) : undefined;
}

function isOneOf<T extends string>(options: readonly T[], value: string | null): value is T {
  return value !== null && (options as readonly string[]).includes(value);
}

export function searchParamsToFormValues(params: Reader): ParsedSearchParams {
  const invalid: string[] = [];
  const has = (key: string) => params.has(key);

  let location: LocationChoice | null = null;
  if (has(PARAM.area)) {
    const area = findAreaById(params.get(PARAM.area) ?? "");
    if (area) {
      location = areaLocation(area);
    } else {
      invalid.push(PARAM.area);
    }
  } else if (has(PARAM.latitude) || has(PARAM.longitude)) {
    const latitude = parseNumber(params.get(PARAM.latitude), DECIMAL);
    const longitude = parseNumber(params.get(PARAM.longitude), DECIMAL);
    const coordinates = discoveryRequestSchema
      .pick({ latitude: true, longitude: true })
      .safeParse({ latitude, longitude });
    if (coordinates.success) {
      location = {
        kind: "device",
        label: DEVICE_LOCATION_LABEL,
        latitude: roundCoordinate(coordinates.data.latitude),
        longitude: roundCoordinate(coordinates.data.longitude),
      };
    } else {
      invalid.push(PARAM.latitude, PARAM.longitude);
    }
  }

  const values: DiscoveryFormValues = { ...DEFAULT_FORM_VALUES, location };

  const purpose = params.get(PARAM.purpose);
  if (purpose !== null) {
    if (isOneOf<Purpose>(PURPOSES, purpose)) values.purpose = purpose;
    else invalid.push(PARAM.purpose);
  }

  if (has(PARAM.radius)) {
    const radius = discoveryRequestSchema.shape.radiusMeters.safeParse(
      parseNumber(params.get(PARAM.radius), INTEGER),
    );
    if (radius.success) values.radiusMeters = radius.data;
    else invalid.push(PARAM.radius);
  }

  if (has(PARAM.minRating)) {
    const rating = discoveryRequestSchema.shape.minRating.safeParse(
      parseNumber(params.get(PARAM.minRating), DECIMAL),
    );
    if (rating.success && rating.data !== undefined) values.minRating = rating.data;
    else invalid.push(PARAM.minRating);
  }

  const budget = params.get(PARAM.budget);
  if (budget !== null) {
    if (isOneOf<Budget>(BUDGETS, budget)) values.budget = budget;
    else invalid.push(PARAM.budget);
  }

  const flags = [
    [PARAM.openNow, "openNowOnly"],
    [PARAM.quiet, "preferQuiet"],
    [PARAM.wifi, "preferWifi"],
  ] as const;
  for (const [param, field] of flags) {
    const raw = params.get(param);
    if (raw === null) continue;
    if (raw === FLAG_ON) values[field] = true;
    else invalid.push(param);
  }

  if (invalid.length > 0) {
    return { status: "invalid", values, invalidParams: invalid };
  }
  if (values.location === null) {
    return { status: "empty", values };
  }
  return { status: "ready", values: { ...values, location: values.location } };
}
