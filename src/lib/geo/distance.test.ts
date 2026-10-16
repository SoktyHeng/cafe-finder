import { describe, expect, it } from "vitest";

import { haversineMeters, roundCoordinate } from "./distance";

describe("haversineMeters", () => {
  it("is zero for the same point", () => {
    const point = { latitude: 11.5564, longitude: 104.9282 };
    expect(haversineMeters(point, point)).toBe(0);
  });

  it("matches one degree of longitude on the equator (~111.2 km)", () => {
    const meters = haversineMeters(
      { latitude: 0, longitude: 0 },
      { latitude: 0, longitude: 1 },
    );
    expect(meters).toBeCloseTo(111_195, -1);
  });

  it("matches the London–Paris great-circle distance (~343.5 km)", () => {
    const meters = haversineMeters(
      { latitude: 51.5074, longitude: -0.1278 },
      { latitude: 48.8566, longitude: 2.3522 },
    );
    expect(meters / 1000).toBeCloseTo(343.5, 0);
  });

  it("is symmetric", () => {
    const a = { latitude: 11.553, longitude: 104.925 };
    const b = { latitude: 11.5765, longitude: 104.923 };
    expect(haversineMeters(a, b)).toBeCloseTo(haversineMeters(b, a), 6);
  });

  it("handles antipodal points without NaN", () => {
    const meters = haversineMeters(
      { latitude: 0, longitude: 0 },
      { latitude: 0, longitude: 180 },
    );
    expect(Number.isNaN(meters)).toBe(false);
    expect(meters / 1000).toBeCloseTo(20_015, 0);
  });
});

describe("roundCoordinate", () => {
  it.each([
    [11.556449, 11.556],
    [104.92851, 104.929],
    [-33.86882, -33.869],
    [0, 0],
  ])("rounds %d to %d", (input, expected) => {
    expect(roundCoordinate(input)).toBe(expected);
  });
});
