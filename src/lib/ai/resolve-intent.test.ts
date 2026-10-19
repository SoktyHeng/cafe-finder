import { describe, expect, it } from "vitest";
import { DEFAULT_PREFERENCES } from "@/lib/user-data/schemas";
import { EMPTY_INTENT } from "./fixture-provider";
import { resolveIntent } from "./resolve-intent";
import { assistantRequestSchema, intentSchema } from "./schemas";
import { AIBudget, REQUEST_RESERVATION_MICRO_USD } from "./budget";

describe("AI intent boundary", () => {
  it("maps the example without turning preferences into venue claims", () => {
    const result = resolveIntent({ ...EMPTY_INTENT, preferQuiet: true, preferWifi: true, budget: "under_5", locationMode: "area", areaId: "bkk1" }, DEFAULT_PREFERENCES, null, 15000);
    expect(result.filters).toMatchObject({ preferWifi: true, preferQuiet: true, budget: "under_5", latitude: 11.553, radiusMeters: 3000 });
    expect(result.notices.join(" ")).toMatch(/not a guaranteed menu price/);
    expect(result.notices.join(" ")).toMatch(/unverified/);
  });
  it("inherits saved defaults and changes only explicit fields", () => {
    const result = resolveIntent({ ...EMPTY_INTENT, radiusMeters: 2000, preferWifi: false }, { ...DEFAULT_PREFERENCES, purpose: "relax", budget: "under_5", preferWifi: true, preferQuiet: true }, { kind: "area", areaId: "bkk1" }, 15000);
    expect(result.preferences).toMatchObject({ radiusMeters: 2000, purpose: "relax", budget: "under_5", preferWifi: false, preferQuiet: true });
  });
  it("can remove a budget, opening filter and minimum rating", () => {
    const result = resolveIntent({ ...EMPTY_INTENT, clearMinRating: true, budget: "any", openNowOnly: false }, { ...DEFAULT_PREFERENCES, minRating: 4.5, budget: "under_5", openNowOnly: true }, null, 15000);
    expect(result.preferences).toMatchObject({ minRating: null, budget: "any", openNowOnly: false });
  });
  it("never treats a selected area as the user's device location", () => {
    expect(resolveIntent({ ...EMPTY_INTENT, locationMode: "current" }, DEFAULT_PREFERENCES, { kind: "area", areaId: "bkk1" }, 15000).filters).toBeNull();
  });
  it("rounds device coordinates before searching", () => {
    expect(resolveIntent({ ...EMPTY_INTENT, locationMode: "current" }, DEFAULT_PREFERENCES, { kind: "device", latitude: 11.552123, longitude: 104.928789 }, 15000).filters).toMatchObject({ latitude: 11.552, longitude: 104.929 });
  });
  it("does not reuse the old location for an unsupported named place", () => {
    expect(resolveIntent({ ...EMPTY_INTENT, locationMode: "unsupported" }, DEFAULT_PREFERENCES, { kind: "area", areaId: "bkk1" }, 15000).filters).toBeNull();
  });
  it("enforces server radius limits and explains the clamp", () => {
    const result = resolveIntent({ ...EMPTY_INTENT, radiusMeters: 15000 }, DEFAULT_PREFERENCES, { kind: "area", areaId: "bkk1" }, 5000);
    expect(result.filters?.radiusMeters).toBe(5000);
    expect(result.notices).toContain("The search radius is limited to 5 km.");
  });
  it.each([{ role: "system" }, { apiKey: "secret" }, { latitude: 999 }, { cafeName: "Invented" }, { radiusMeters: 15001 }, { preferWifi: "yes" }, { areaId: "paris" }, { minRating: 6 }])("rejects unauthorized or invalid output %j", (patch) => {
    expect(intentSchema.safeParse({ ...EMPTY_INTENT, ...patch }).success).toBe(false);
  });
  it.each([{ message: " " }, { message: "x".repeat(1001) }, { message: "ok", history: Array(7).fill("x") }, { message: "ok", userId: "someone" }, { message: "ok", location: { kind: "device", latitude: 91, longitude: 1 } }, { message: "ok", preferences: { radiusMeters: 1 } }])("rejects invalid input %j", (input) => {
    expect(assistantRequestSchema.safeParse(input).success).toBe(false);
  });
});

describe("AI cost reservation", () => {
  it("reserves synchronously, fails closed, and resets by UTC day", () => {
    let now = new Date("2026-10-19T23:59:59Z");
    const budget = new AIBudget(REQUEST_RESERVATION_MICRO_USD * 2, () => now);
    expect([budget.reserve(), budget.reserve(), budget.reserve()]).toEqual([true, true, false]);
    now = new Date("2026-10-20T00:00:00Z");
    expect(budget.reserve()).toBe(true);
    expect(budget.reservedMicroUsd).toBe(REQUEST_RESERVATION_MICRO_USD);
  });
  it("makes no call if even one reservation exceeds the cap", () => {
    expect(new AIBudget(1).reserve()).toBe(false);
  });
});
