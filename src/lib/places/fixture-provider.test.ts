import { describe, expect, it } from "vitest";

import { haversineMeters } from "@/lib/geo/distance";

import { FIXTURE_CAFES } from "./fixture-data";
import { FixturePlacesProvider } from "./fixture-provider";
import { MAX_NEARBY_RESULTS } from "./provider";
import { cafePlaceSchema, type CafePlace } from "./schemas";

const CITY_CENTRE = { latitude: 11.5564, longitude: 104.9282 };

describe("fixture data", () => {
  it("is schema-valid, labelled as fixture and uses non-Google IDs", () => {
    for (const cafe of FIXTURE_CAFES) {
      expect(cafePlaceSchema.safeParse(cafe).success).toBe(true);
      expect(cafe.dataSource).toBe("fixture");
      expect(cafe.placeId).toMatch(/^fixture-\d{3}$/);
    }
  });

  it("covers unknown-data cases", () => {
    expect(FIXTURE_CAFES.some((cafe) => cafe.rating === undefined)).toBe(true);
    expect(FIXTURE_CAFES.some((cafe) => cafe.openNow === undefined)).toBe(true);
    expect(FIXTURE_CAFES.some((cafe) => cafe.openNow === false)).toBe(true);
    expect(FIXTURE_CAFES.some((cafe) => cafe.priceLevel === undefined)).toBe(true);
  });
});

describe("FixturePlacesProvider", () => {
  it("returns only cafes inside the search circle", async () => {
    const provider = new FixturePlacesProvider();
    const results = await provider.searchNearby({ center: CITY_CENTRE, radiusMeters: 1000 });

    expect(results.length).toBeGreaterThan(0);
    for (const cafe of results) {
      expect(
        haversineMeters(CITY_CENTRE, {
          latitude: cafe.latitude ?? Number.NaN,
          longitude: cafe.longitude ?? Number.NaN,
        }),
      ).toBeLessThanOrEqual(1000);
    }
  });

  it("returns nothing far away from Phnom Penh", async () => {
    const provider = new FixturePlacesProvider();
    const results = await provider.searchNearby({
      center: { latitude: 51.5, longitude: -0.12 },
      radiusMeters: 15_000,
    });
    expect(results).toEqual([]);
  });

  it("caps results at the Nearby Search maximum", async () => {
    const many: CafePlace[] = Array.from({ length: 30 }, (_, index) => ({
      placeId: `fixture-${String(index).padStart(3, "0")}`,
      latitude: CITY_CENTRE.latitude,
      longitude: CITY_CENTRE.longitude,
      dataSource: "fixture",
    }));
    const provider = new FixturePlacesProvider(many);
    const results = await provider.searchNearby({ center: CITY_CENTRE, radiusMeters: 1000 });
    expect(results).toHaveLength(MAX_NEARBY_RESULTS);
  });

  it("skips cafes without coordinates", async () => {
    const provider = new FixturePlacesProvider([
      { placeId: "fixture-900", dataSource: "fixture" },
    ]);
    expect(
      await provider.searchNearby({ center: CITY_CENTRE, radiusMeters: 15_000 }),
    ).toEqual([]);
  });

  it("returns copies, not the shared fixture objects", async () => {
    const provider = new FixturePlacesProvider();
    const [first] = await provider.searchNearby({ center: CITY_CENTRE, radiusMeters: 15_000 });
    expect(first).toBeDefined();
    expect(FIXTURE_CAFES).not.toContain(first);
  });
});
