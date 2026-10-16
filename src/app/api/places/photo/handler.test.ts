import { beforeEach, describe, expect, it, vi } from "vitest";

import { FixturePlacesProvider } from "@/lib/places/fixture-provider";
import {
  PlacesProviderUnavailableError,
  type PlacesProvider,
} from "@/lib/places/provider";
import { apiErrorBodySchema } from "@/lib/security/api-error";

import { createPlacePhotoHandler } from "./handler";

const NAME = "places/ChIJabc/photos/AbC_1-x";
const PHOTO_URL = "https://lh3.googleusercontent.com/p/abc=s400";

function makeHandler(provider: PlacesProvider) {
  return createPlacePhotoHandler({
    getEnv: () => ({ PLACES_PROVIDER: "google", GOOGLE_PLACES_SERVER_API_KEY: "k" }),
    getProvider: () => provider,
    guard: () => () => null,
  });
}

function providerReturning(url: string | null) {
  const provider = new FixturePlacesProvider();
  const spy = vi.spyOn(provider, "getPhotoUrl").mockResolvedValue(url);
  return { provider, spy };
}

const get = (query: string) => new Request(`http://localhost/api/places/photo?${query}`);

beforeEach(() => {
  for (const method of ["info", "warn", "error"] as const) {
    vi.spyOn(console, method).mockImplementation(() => {});
  }
});

describe("GET /api/places/photo", () => {
  it("redirects to the Google image URL without caching", async () => {
    const { provider, spy } = providerReturning(PHOTO_URL);
    const response = await makeHandler(provider)(
      get(`name=${encodeURIComponent(NAME)}&maxWidthPx=800`),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(PHOTO_URL);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(spy).toHaveBeenCalledExactlyOnceWith(NAME, 800);
  });

  it("defaults to a 400px width", async () => {
    const { provider, spy } = providerReturning(PHOTO_URL);
    await makeHandler(provider)(get(`name=${encodeURIComponent(NAME)}`));
    expect(spy).toHaveBeenCalledWith(NAME, 400);
  });

  it.each([
    "",
    "name=",
    `name=${encodeURIComponent("https://evil.example/x.jpg")}`,
    `name=${encodeURIComponent("places/a/photos/b/../../c")}`,
    `name=${encodeURIComponent(NAME)}&maxWidthPx=4800`,
    `name=${encodeURIComponent(NAME)}&maxWidthPx=abc`,
  ])("rejects %j without calling the provider", async (query) => {
    const { provider, spy } = providerReturning(PHOTO_URL);
    const response = await makeHandler(provider)(get(query));
    expect(response.status).toBe(400);
    expect(spy).not.toHaveBeenCalled();
  });

  it("returns 404 for expired or unknown photos", async () => {
    const { provider } = providerReturning(null);
    const response = await makeHandler(provider)(get(`name=${encodeURIComponent(NAME)}`));
    expect(response.status).toBe(404);
  });

  it("returns 503 when the provider is unavailable", async () => {
    const provider = new FixturePlacesProvider();
    vi.spyOn(provider, "getPhotoUrl").mockRejectedValue(new PlacesProviderUnavailableError("google:quota"));
    const response = await makeHandler(provider)(get(`name=${encodeURIComponent(NAME)}`));
    expect(response.status).toBe(503);
    expect(apiErrorBodySchema.parse(await response.json()).error.code).toBe("UPSTREAM_UNAVAILABLE");
  });
});
