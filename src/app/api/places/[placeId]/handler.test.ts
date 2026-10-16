import { beforeEach, describe, expect, it, vi } from "vitest";

import { FixturePlacesProvider } from "@/lib/places/fixture-provider";
import {
  PlacesProviderUnavailableError,
  type PlacesProvider,
} from "@/lib/places/provider";
import { placeDetailsResponseSchema } from "@/lib/places/schemas";
import { apiErrorBodySchema } from "@/lib/security/api-error";
import { FixedWindowRateLimiter } from "@/lib/security/rate-limit";
import { createRequestGuard, type RequestGuard } from "@/lib/security/request-guard";

import { createPlaceDetailsHandler } from "./handler";

const FIXED_NOW = new Date("2026-10-16T00:00:00.000Z");

function makeHandler(provider: PlacesProvider = new FixturePlacesProvider(), guard?: RequestGuard) {
  return createPlaceDetailsHandler({
    getEnv: () => ({ PLACES_PROVIDER: "fixture", GOOGLE_PLACES_SERVER_API_KEY: undefined }),
    getProvider: () => provider,
    guard: () => guard ?? (() => null),
    now: () => FIXED_NOW,
  });
}

const get = () => new Request("http://localhost/api/places/x");

beforeEach(() => {
  for (const method of ["info", "warn", "error"] as const) {
    vi.spyOn(console, method).mockImplementation(() => {});
  }
});

describe("GET /api/places/[placeId]", () => {
  it("returns schema-valid details", async () => {
    const response = await makeHandler()(get(), "fixture-001");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = placeDetailsResponseSchema.parse(await response.json());
    expect(body).toMatchObject({
      source: "fixture",
      fetchedAt: FIXED_NOW.toISOString(),
      place: { placeId: "fixture-001", photos: [] },
      attributions: [],
    });
  });

  it.each(["", "a b", "../etc", "x".repeat(513), "id;drop"])("rejects invalid ID %j", async (placeId) => {
    const provider = new FixturePlacesProvider();
    const spy = vi.spyOn(provider, "getPlaceDetails");
    const response = await makeHandler(provider)(get(), placeId);
    expect(response.status).toBe(400);
    expect(spy).not.toHaveBeenCalled();
  });

  it("returns 404 for unknown places", async () => {
    const response = await makeHandler()(get(), "ChIJdoesNotExist");
    expect(response.status).toBe(404);
    expect(apiErrorBodySchema.parse(await response.json()).error.code).toBe("NOT_FOUND");
  });

  it("returns 503 without detail when the provider is unavailable", async () => {
    const provider = new FixturePlacesProvider();
    vi.spyOn(provider, "getPlaceDetails").mockRejectedValue(
      new PlacesProviderUnavailableError("google:auth"),
    );
    const response = await makeHandler(provider)(get(), "ChIJabc");
    const body = apiErrorBodySchema.parse(await response.json());
    expect(response.status).toBe(503);
    expect(body.error.message).not.toContain("auth");
  });

  it("rate limits per client", async () => {
    const guard = createRequestGuard({
      name: "details",
      perClientLimit: 1,
      globalLimiter: new FixedWindowRateLimiter({ limit: 100, windowMs: 60_000 }),
      trustProxy: false,
    });
    const handler = makeHandler(undefined, guard);
    expect((await handler(get(), "fixture-001")).status).toBe(200);
    expect((await handler(get(), "fixture-001")).status).toBe(429);
  });
});
