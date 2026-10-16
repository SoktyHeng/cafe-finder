import { describe, expect, it } from "vitest";

import { discoveryRequestSchema } from "@/lib/discovery/request-schema";
import { findAreaById } from "@/lib/locations/cities";

import {
  DEFAULT_FORM_VALUES,
  areaLocation,
  deviceLocation,
  isReady,
  toDiscoveryRequest,
} from "./form-state";

const riverside = findAreaById("riverside");
if (!riverside) throw new Error("riverside area missing");

describe("form state", () => {
  it("is not ready without a location", () => {
    expect(isReady(DEFAULT_FORM_VALUES)).toBe(false);
    expect(isReady({ ...DEFAULT_FORM_VALUES, location: areaLocation(riverside) })).toBe(true);
  });

  it("rounds device positions and keeps accuracy", () => {
    expect(
      deviceLocation({ latitude: 11.55649, longitude: 104.92851, accuracyMeters: 35 }),
    ).toEqual({
      kind: "device",
      label: "your current location",
      latitude: 11.556,
      longitude: 104.929,
      accuracyMeters: 35,
    });
  });

  it("builds a minimal, schema-valid request from defaults", () => {
    const request = toDiscoveryRequest({
      ...DEFAULT_FORM_VALUES,
      location: areaLocation(riverside),
    });
    expect(request).toEqual({
      latitude: riverside.latitude,
      longitude: riverside.longitude,
      radiusMeters: 3000,
      purpose: "work",
    });
    expect(discoveryRequestSchema.safeParse(request).success).toBe(true);
  });

  it("includes every non-default preference", () => {
    const request = toDiscoveryRequest({
      location: areaLocation(riverside),
      purpose: "friends",
      radiusMeters: 5000,
      minRating: 4,
      openNowOnly: true,
      budget: "under_5",
      preferQuiet: true,
      preferWifi: true,
    });
    expect(request).toMatchObject({
      minRating: 4,
      openNowOnly: true,
      budget: "under_5",
      preferQuiet: true,
      preferWifi: true,
    });
    expect(discoveryRequestSchema.safeParse(request).success).toBe(true);
  });
});
