import { afterEach, describe, expect, it, vi } from "vitest";

import { FixturePlacesProvider } from "@/lib/places/fixture-provider";
import {
  PlacesProviderUnavailableError,
  type PlacesProvider,
} from "@/lib/places/provider";
import { nearbySearchResponseSchema } from "@/lib/discovery/response-schema";
import { apiErrorBodySchema } from "@/lib/security/api-error";
import { FixedWindowRateLimiter } from "@/lib/security/rate-limit";
import { createRequestGuard, type RequestGuard } from "@/lib/security/request-guard";

import { MAX_BODY_BYTES, createNearbySearchHandler } from "./handler";

const FIXED_NOW = new Date("2026-10-16T00:00:00.000Z");

const VALID_BODY = {
  latitude: 11.553,
  longitude: 104.925,
  radiusMeters: 3000,
  purpose: "work",
};

function makeHandler(
  overrides: {
    provider?: PlacesProvider | (() => never);
    maxRadius?: number;
    guard?: RequestGuard;
  } = {},
) {
  return createNearbySearchHandler({
    getEnv: () => ({
      PLACES_PROVIDER: "fixture",
      GOOGLE_PLACES_SERVER_API_KEY: undefined,
      MAX_SEARCH_RADIUS_METERS: overrides.maxRadius ?? 15_000,
    }),
    guard: () => overrides.guard ?? (() => null),
    getProvider: () => {
      const provider = overrides.provider ?? new FixturePlacesProvider();
      return typeof provider === "function" ? provider() : provider;
    },
    now: () => FIXED_NOW,
  });
}

function post(body: unknown, init: { contentType?: string; raw?: string } = {}) {
  return new Request("http://localhost/api/places/nearby", {
    method: "POST",
    headers: { "Content-Type": init.contentType ?? "application/json" },
    body: init.raw ?? JSON.stringify(body),
  });
}

async function errorOf(response: Response) {
  return apiErrorBodySchema.parse(await response.json()).error;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/places/nearby", () => {
  it("returns schema-valid fixture results ordered by distance", async () => {
    const response = await makeHandler()(post(VALID_BODY));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = nearbySearchResponseSchema.parse(await response.json());
    expect(body.source).toBe("fixture");
    expect(body.searchedAt).toBe(FIXED_NOW.toISOString());
    expect(body.coverageNote).toMatch(/not an exhaustive list/);
    expect(body.results.length).toBeGreaterThan(0);

    const scores = body.results.map((result) => result.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    expect(body.results.every((result) => result.cafe.dataSource === "fixture")).toBe(true);
    expect(body.results.every((result) => result.unverifiedPreferences.includes("Good for work or study"))).toBe(true);
  });

  it("applies hard filters and reports what was excluded", async () => {
    const response = await makeHandler()(
      post({ ...VALID_BODY, minRating: 4.5, openNowOnly: true }),
    );
    const body = nearbySearchResponseSchema.parse(await response.json());

    for (const { cafe } of body.results) {
      expect(cafe.openNow).not.toBe(false);
      if (cafe.rating !== undefined) expect(cafe.rating).toBeGreaterThanOrEqual(4.5);
    }
    // The fixture set has an unrated cafe and one with unknown hours nearby.
    expect(body.results.some(({ cafe }) => cafe.rating === undefined)).toBe(true);
    expect(body.excluded.permanentlyClosed).toBeGreaterThan(0);
  });

  it("returns an empty list (not an error) when nothing is nearby", async () => {
    const response = await makeHandler()(
      post({ ...VALID_BODY, latitude: 51.5, longitude: -0.12 }),
    );
    expect(response.status).toBe(200);
    expect(nearbySearchResponseSchema.parse(await response.json()).results).toEqual([]);
  });

  it("passes only the validated centre and radius to the provider", async () => {
    const provider = new FixturePlacesProvider();
    const spy = vi.spyOn(provider, "searchNearby");
    await makeHandler({ provider })(post({ ...VALID_BODY, preferWifi: true }));

    expect(spy).toHaveBeenCalledExactlyOnceWith({
      center: { latitude: 11.553, longitude: 104.925 },
      radiusMeters: 3000,
    });
  });

  describe("validation", () => {
    it("rejects non-JSON content types", async () => {
      const response = await makeHandler()(
        post(null, { contentType: "text/plain", raw: JSON.stringify(VALID_BODY) }),
      );
      expect(response.status).toBe(400);
      expect((await errorOf(response)).code).toBe("VALIDATION_ERROR");
    });

    it("rejects malformed JSON", async () => {
      const response = await makeHandler()(post(null, { raw: "{not json" }));
      expect(response.status).toBe(400);
    });

    it("rejects oversized bodies", async () => {
      const response = await makeHandler()(
        post(null, { raw: JSON.stringify({ ...VALID_BODY, pad: "x".repeat(MAX_BODY_BYTES) }) }),
      );
      expect(response.status).toBe(400);
      expect((await errorOf(response)).message).toMatch(/too large/);
    });

    it("names invalid fields without echoing submitted values", async () => {
      const response = await makeHandler()(
        post({ ...VALID_BODY, latitude: 123.456789, purpose: "<script>" }),
      );
      const error = await errorOf(response);

      expect(response.status).toBe(400);
      expect(error.message).toContain("latitude");
      expect(error.message).toContain("purpose");
      expect(error.message).not.toContain("123.456789");
      expect(error.message).not.toContain("<script>");
    });

    it("rejects unknown fields", async () => {
      const response = await makeHandler()(post({ ...VALID_BODY, includedTypes: ["bar"] }));
      expect(response.status).toBe(400);
    });

    it("enforces the configured maximum radius", async () => {
      const response = await makeHandler({ maxRadius: 5000 })(
        post({ ...VALID_BODY, radiusMeters: 6000 }),
      );
      expect(response.status).toBe(400);
      expect((await errorOf(response)).message).toMatch(/5 km/);
    });
  });

  describe("provider failures", () => {
    it("maps an unavailable provider to 503 UPSTREAM_UNAVAILABLE", async () => {
      const response = await makeHandler({
        provider: () => {
          throw new PlacesProviderUnavailableError("not configured: secret detail");
        },
      })(post(VALID_BODY));
      const error = await errorOf(response);

      expect(response.status).toBe(503);
      expect(error.code).toBe("UPSTREAM_UNAVAILABLE");
      expect(error.message).not.toContain("secret detail");
    });

    it("maps unexpected errors to 500 without leaking details or coordinates", async () => {
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      const failing: PlacesProvider = {
        source: "fixture",
        searchNearby: () => Promise.reject(new Error("upstream said: key=AIzaSECRET")),
        getPlaceDetails: () => Promise.resolve(null),
        getPhotoUrl: () => Promise.resolve(null),
        getPlaceSummary: () => Promise.resolve(null),
      };
      const response = await makeHandler({ provider: failing })(post(VALID_BODY));
      const error = await errorOf(response);

      expect(response.status).toBe(500);
      expect(error.code).toBe("INTERNAL_ERROR");
      expect(error.message).not.toContain("AIzaSECRET");

      const logged = log.mock.calls.flat().join(" ");
      expect(logged).not.toContain("AIzaSECRET");
      expect(logged).not.toContain("11.553");
    });
  });

  describe("rate limiting", () => {
    const guardWith = (perClientLimit: number, globalLimit = 100) =>
      createRequestGuard({
        name: "test",
        perClientLimit,
        globalLimiter: new FixedWindowRateLimiter({ limit: globalLimit, windowMs: 60_000 }),
        trustProxy: false,
      });

    it("returns 429 with Retry-After once the client limit is reached", async () => {
      const handler = makeHandler({ guard: guardWith(2) });
      expect((await handler(post(VALID_BODY))).status).toBe(200);
      expect((await handler(post(VALID_BODY))).status).toBe(200);

      const limited = await handler(post(VALID_BODY));
      expect(limited.status).toBe(429);
      expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
      expect((await errorOf(limited)).code).toBe("RATE_LIMITED");
    });

    it("does not spend the limit on invalid requests", async () => {
      const handler = makeHandler({ guard: guardWith(1) });
      expect((await handler(post({ ...VALID_BODY, purpose: "x" }))).status).toBe(400);
      expect((await handler(post(VALID_BODY))).status).toBe(200);
    });

    it("never calls the provider when limited", async () => {
      const provider = new FixturePlacesProvider();
      const spy = vi.spyOn(provider, "searchNearby");
      const handler = makeHandler({ provider, guard: guardWith(1) });
      await handler(post(VALID_BODY));
      await handler(post(VALID_BODY));
      expect(spy).toHaveBeenCalledOnce();
    });
  });

  it("passes provider attributions and de-duplicates places", async () => {
    const provider: PlacesProvider = {
      source: "google",
      searchNearby: async () => ({
        places: [
          { placeId: "ChIJa", latitude: 11.553, longitude: 104.925, dataSource: "google" },
          { placeId: "ChIJa", latitude: 11.553, longitude: 104.925, dataSource: "google" },
        ],
        attributions: [{ provider: "Example Data Co" }],
      }),
      getPlaceDetails: async () => null,
      getPhotoUrl: async () => null,
      getPlaceSummary: async () => null,
    };
    const body = nearbySearchResponseSchema.parse(
      await (await makeHandler({ provider })(post(VALID_BODY))).json(),
    );
    expect(body.source).toBe("google");
    expect(body.results.map((result) => result.cafe.placeId)).toEqual(["ChIJa"]);
    expect(body.attributions).toEqual([{ provider: "Example Data Co" }]);
  });
});
