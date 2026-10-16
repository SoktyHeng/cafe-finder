import { describe, expect, it } from "vitest";

import type { CafePlace } from "@/lib/places/schemas";

import { applyHardFilters, orderByDistance, withDistance } from "./filters";

const cafe = (overrides: Partial<CafePlace> & { placeId: string }): CafePlace => ({
  dataSource: "fixture",
  ...overrides,
});

describe("applyHardFilters", () => {
  const cafes = [
    cafe({ placeId: "a", rating: 4.6, openNow: true }),
    cafe({ placeId: "b", rating: 3.9, openNow: true }),
    cafe({ placeId: "c", openNow: true }), // unrated
    cafe({ placeId: "d", rating: 4.8, openNow: false }),
    cafe({ placeId: "e", rating: 4.7 }), // hours unknown
    cafe({ placeId: "f", rating: 4.9, businessStatus: "closed_permanently" }),
  ];
  const ids = (list: CafePlace[]) => list.map((item) => item.placeId);

  it("only removes permanently closed cafes when no filters are set", () => {
    const { kept, excluded } = applyHardFilters(cafes, {});
    expect(ids(kept)).toEqual(["a", "b", "c", "d", "e"]);
    expect(excluded).toEqual({ belowMinRating: 0, closedNow: 0, permanentlyClosed: 1 });
  });

  it("removes low-rated cafes but keeps unrated ones", () => {
    const { kept, excluded } = applyHardFilters(cafes, { minRating: 4.5 });
    expect(ids(kept)).toEqual(["a", "c", "d", "e"]);
    expect(excluded.belowMinRating).toBe(1);
  });

  it("treats the threshold as inclusive", () => {
    const { kept } = applyHardFilters([cafe({ placeId: "x", rating: 4.5 })], {
      minRating: 4.5,
    });
    expect(ids(kept)).toEqual(["x"]);
  });

  it("keeps a zero rating when there is no minimum and removes it when there is", () => {
    const zero = [cafe({ placeId: "z", rating: 0, ratingCount: 0 })];
    expect(applyHardFilters(zero, {}).kept).toHaveLength(1);
    expect(applyHardFilters(zero, { minRating: 1 }).kept).toHaveLength(0);
  });

  it("removes cafes known to be closed but keeps unknown opening hours", () => {
    const { kept, excluded } = applyHardFilters(cafes, { openNowOnly: true });
    expect(ids(kept)).toEqual(["a", "b", "c", "e"]);
    expect(excluded.closedNow).toBe(1);
  });

  it("does not filter on opening status when openNowOnly is off", () => {
    expect(ids(applyHardFilters(cafes, { openNowOnly: false }).kept)).toContain("d");
  });

  it("counts each excluded cafe once, by the first failing rule", () => {
    const { excluded } = applyHardFilters(
      [cafe({ placeId: "y", rating: 2, openNow: false })],
      { minRating: 4, openNowOnly: true },
    );
    expect(excluded).toEqual({ belowMinRating: 1, closedNow: 0, permanentlyClosed: 0 });
  });
});

describe("withDistance", () => {
  const origin = { latitude: 11.5564, longitude: 104.9282 };

  it("adds a rounded straight-line distance when coordinates are known", () => {
    const [result] = withDistance(
      [cafe({ placeId: "a", latitude: 11.5564, longitude: 104.9382 })],
      origin,
    );
    expect(result?.distanceMeters).toBeGreaterThan(1080);
    expect(result?.distanceMeters).toBeLessThan(1100);
    expect(Number.isInteger(result?.distanceMeters)).toBe(true);
  });

  it("leaves distance unknown when coordinates are missing", () => {
    const [result] = withDistance([cafe({ placeId: "a", latitude: 11.5 })], origin);
    expect(result?.distanceMeters).toBeUndefined();
  });
});

describe("orderByDistance", () => {
  it("sorts nearest first, unknown last, ties by place ID, without mutating input", () => {
    const input = [
      cafe({ placeId: "unknown" }),
      cafe({ placeId: "far", distanceMeters: 900 }),
      cafe({ placeId: "tie-b", distanceMeters: 100 }),
      cafe({ placeId: "tie-a", distanceMeters: 100 }),
    ];
    const snapshot = [...input];

    expect(orderByDistance(input).map((item) => item.placeId)).toEqual([
      "tie-a",
      "tie-b",
      "far",
      "unknown",
    ]);
    expect(input).toEqual(snapshot);
  });
});
