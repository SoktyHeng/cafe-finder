import { describe, expect, it } from "vitest";

import { BUDGETS, PURPOSES, discoveryRequestSchema } from "./request-schema";

const valid = {
  latitude: 11.5564,
  longitude: 104.9282,
  radiusMeters: 3000,
  purpose: "work",
};

const parse = (overrides: Record<string, unknown>) =>
  discoveryRequestSchema.safeParse({ ...valid, ...overrides });

describe("discoveryRequestSchema", () => {
  it("accepts a minimal request", () => {
    expect(discoveryRequestSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts a request with every optional field", () => {
    expect(
      parse({
        minRating: 4.5,
        openNowOnly: true,
        budget: "under_5",
        preferQuiet: true,
        preferWifi: false,
      }).success,
    ).toBe(true);
  });

  it.each([
    [999, false],
    [1000, true],
    [15000, true],
    [15001, false],
    [2500.5, false],
  ])("radiusMeters=%d valid=%s", (radiusMeters, ok) => {
    expect(parse({ radiusMeters }).success).toBe(ok);
  });

  it.each([
    [{ latitude: -90 }, true],
    [{ latitude: 90 }, true],
    [{ latitude: 90.0001 }, false],
    [{ longitude: -180 }, true],
    [{ longitude: 180.5 }, false],
    [{ latitude: Number.NaN }, false],
    [{ longitude: Number.POSITIVE_INFINITY }, false],
  ])("coordinates %o valid=%s", (overrides, ok) => {
    expect(parse(overrides).success).toBe(ok);
  });

  it.each([
    [-0.1, false],
    [0, true],
    [5, true],
    [5.1, false],
  ])("minRating=%d valid=%s", (minRating, ok) => {
    expect(parse({ minRating }).success).toBe(ok);
  });

  it("accepts every purpose and budget and rejects others", () => {
    for (const purpose of PURPOSES) expect(parse({ purpose }).success).toBe(true);
    for (const budget of BUDGETS) expect(parse({ budget }).success).toBe(true);
    expect(parse({ purpose: "party" }).success).toBe(false);
    expect(parse({ budget: "cheap" }).success).toBe(false);
  });

  it("does not coerce strings to numbers or booleans", () => {
    expect(parse({ latitude: "11.5" }).success).toBe(false);
    expect(parse({ radiusMeters: "3000" }).success).toBe(false);
    expect(parse({ openNowOnly: "true" }).success).toBe(false);
  });

  it("rejects missing required fields and unknown keys", () => {
    const { purpose: _omitted, ...withoutPurpose } = valid;
    void _omitted;
    expect(discoveryRequestSchema.safeParse(withoutPurpose).success).toBe(false);
    expect(parse({ apiKey: "x" }).success).toBe(false);
  });
});
