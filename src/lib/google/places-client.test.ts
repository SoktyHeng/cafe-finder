import { afterEach, describe, expect, it, vi } from "vitest";

import { GooglePlacesError } from "./errors";
import { NEARBY_SEARCH_FIELD_MASK, PLACE_DETAILS_FIELD_MASK } from "./field-masks";
import { GooglePlacesClient, type NearbySearchRequestBody } from "./places-client";

const API_KEY = "test-key-NOT-REAL-123";

const NEARBY_BODY: NearbySearchRequestBody = {
  includedTypes: ["cafe", "coffee_shop"],
  maxResultCount: 20,
  rankPreference: "POPULARITY",
  languageCode: "en",
  locationRestriction: {
    circle: { center: { latitude: 11.553, longitude: 104.925 }, radius: 3000 },
  },
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function setup(...responses: (Response | Error | DOMException)[]) {
  const fetchImpl = vi.fn<typeof fetch>();
  for (const response of responses) {
    if (response instanceof Response) fetchImpl.mockResolvedValueOnce(response);
    else fetchImpl.mockRejectedValueOnce(response);
  }
  const client = new GooglePlacesClient({ apiKey: API_KEY, fetchImpl, retryDelayMs: 0 });
  return { client, fetchImpl };
}

const logs: string[] = [];
afterEach(() => {
  logs.length = 0;
});
function captureLogs() {
  for (const method of ["info", "warn", "error"] as const) {
    vi.spyOn(console, method).mockImplementation((line: unknown) => {
      logs.push(String(line));
    });
  }
}

describe("field masks", () => {
  it("are explicit, wildcard-free and stable", () => {
    expect(NEARBY_SEARCH_FIELD_MASK).toBe(
      "places.id,places.displayName,places.location,places.shortFormattedAddress," +
        "places.businessStatus,places.googleMapsUri,places.attributions,places.rating," +
        "places.userRatingCount,places.priceLevel,places.currentOpeningHours",
    );
    expect(PLACE_DETAILS_FIELD_MASK).toBe(
      "id,displayName,location,formattedAddress,businessStatus,googleMapsUri,attributions," +
        "photos,utcOffsetMinutes,rating,userRatingCount,priceLevel,currentOpeningHours," +
        "websiteUri,nationalPhoneNumber",
    );
    for (const mask of [NEARBY_SEARCH_FIELD_MASK, PLACE_DETAILS_FIELD_MASK]) {
      expect(mask).not.toContain("*");
      expect(mask).not.toMatch(/\s/);
      // Atmosphere-tier fields would raise the SKU; keep them out.
      expect(mask).not.toMatch(/reviews|servesCoffee|editorialSummary|generativeSummary/);
    }
  });
});

describe("GooglePlacesClient", () => {
  it("sends Nearby Search with key and field mask headers, never in the URL", async () => {
    captureLogs();
    const { client, fetchImpl } = setup(json({ places: [] }));
    await client.searchNearby(NEARBY_BODY);

    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe("https://places.googleapis.com/v1/places:searchNearby");
    expect(String(url)).not.toContain(API_KEY);
    expect(init?.method).toBe("POST");
    expect(init?.headers).toEqual({
      "Content-Type": "application/json",
      "X-Goog-FieldMask": NEARBY_SEARCH_FIELD_MASK,
      "X-Goog-Api-Key": API_KEY,
    });
    expect(JSON.parse(String(init?.body))).toEqual(NEARBY_BODY);
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("requests place details by encoded ID with the details field mask", async () => {
    captureLogs();
    const { client, fetchImpl } = setup(json({ id: "ChIJabc" }));
    await client.getPlace("ChIJabc_-1");

    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe("https://places.googleapis.com/v1/places/ChIJabc_-1?languageCode=en");
    expect(init?.method).toBe("GET");
    expect(init?.headers).toMatchObject({ "X-Goog-FieldMask": PLACE_DETAILS_FIELD_MASK });
  });

  it("requests photo media as JSON without following the redirect", async () => {
    captureLogs();
    const { client, fetchImpl } = setup(json({ photoUri: "https://lh3.googleusercontent.com/x" }));
    await client.getPhotoMedia("places/ChIJabc/photos/AbC_1", 400);

    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe(
      "https://places.googleapis.com/v1/places/ChIJabc/photos/AbC_1/media?maxWidthPx=400&skipHttpRedirect=true",
    );
    expect(init?.headers).toEqual({ "X-Goog-Api-Key": API_KEY });
  });

  it.each([
    [400, "INVALID_ARGUMENT", "bad_request"],
    [403, "PERMISSION_DENIED", "auth"],
    [404, "NOT_FOUND", "not_found"],
    [429, "RESOURCE_EXHAUSTED", "quota"],
  ] as const)("maps HTTP %d without retrying", async (status, upstreamStatus, kind) => {
    captureLogs();
    const { client, fetchImpl } = setup(
      json({ error: { code: status, status: upstreamStatus, message: `detail with ${API_KEY}` } }, status),
    );

    const error = await client.searchNearby(NEARBY_BODY).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(GooglePlacesError);
    expect(error).toMatchObject({ kind, httpStatus: status, upstreamStatus });
    expect(String((error as Error).message)).not.toContain(API_KEY);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it.each([
    [400, "INVALID_ARGUMENT", "API_KEY_INVALID"],
    [403, "PERMISSION_DENIED", "API_KEY_SERVICE_BLOCKED"],
  ])("classifies key problems (%d %s) as auth, not bad input", async (status, upstreamStatus, reason) => {
    captureLogs();
    // Shape captured from Places API (New) with an invalid key (2026-10-16).
    const { client } = setup(
      json(
        {
          error: {
            code: status,
            message: "API key not valid. Please pass a valid API key.",
            status: upstreamStatus,
            details: [
              { "@type": "type.googleapis.com/google.rpc.ErrorInfo", reason, domain: "googleapis.com" },
            ],
          },
        },
        status,
      ),
    );
    await expect(client.getPlace("ChIJabc")).rejects.toMatchObject({
      kind: "auth",
      upstreamReason: reason,
    });
    expect(JSON.parse(logs[0] ?? "{}")).toMatchObject({ level: "error", upstreamReason: reason });
  });

  it("retries a 5xx once, then succeeds", async () => {
    captureLogs();
    const { client, fetchImpl } = setup(json({ error: { status: "UNAVAILABLE" } }, 503), json({ places: [] }));
    await expect(client.searchNearby(NEARBY_BODY)).resolves.toEqual({ places: [] });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("gives up after one retry on repeated 5xx", async () => {
    captureLogs();
    const { client, fetchImpl } = setup(json({}, 500), json({}, 502), json({ places: [] }));
    await expect(client.searchNearby(NEARBY_BODY)).rejects.toMatchObject({ kind: "unavailable" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("retries network errors once", async () => {
    captureLogs();
    const { client, fetchImpl } = setup(new TypeError("fetch failed"), json({ places: [] }));
    await expect(client.searchNearby(NEARBY_BODY)).resolves.toEqual({ places: [] });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("classifies timeouts and does not retry them", async () => {
    captureLogs();
    const timeout = new DOMException("The operation timed out.", "TimeoutError");
    const { client, fetchImpl } = setup(timeout);
    await expect(client.getPlace("ChIJabc")).rejects.toMatchObject({ kind: "timeout" });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("aborts slow requests after the timeout", async () => {
    captureLogs();
    const fetchImpl = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        }),
    );
    const client = new GooglePlacesClient({ apiKey: API_KEY, fetchImpl, timeoutMs: 20 });
    await expect(client.getPlace("ChIJabc")).rejects.toMatchObject({ kind: "timeout" });
  });

  it("treats a non-JSON success body as an invalid response", async () => {
    captureLogs();
    const { client } = setup(new Response("<html>", { status: 200 }));
    await expect(client.getPlace("ChIJabc")).rejects.toMatchObject({ kind: "invalid_response" });
  });

  it("logs coarse usage telemetry without the key or request coordinates", async () => {
    captureLogs();
    const { client } = setup(json({ error: { status: "RESOURCE_EXHAUSTED" } }, 429));
    await client.searchNearby(NEARBY_BODY).catch(() => undefined);

    expect(logs).toHaveLength(1);
    const entry = JSON.parse(logs[0] ?? "{}");
    expect(entry).toMatchObject({
      event: "places_api_call",
      endpoint: "nearbySearch",
      sku: "Nearby Search Enterprise",
      outcome: "quota",
      httpStatus: 429,
      upstreamStatus: "RESOURCE_EXHAUSTED",
    });
    const all = logs.join("\n");
    expect(all).not.toContain(API_KEY);
    expect(all).not.toContain("11.553");
    expect(all).not.toContain("104.925");
  });
});
