import { beforeEach, describe, expect, it, vi } from "vitest";

import { GooglePlacesError } from "@/lib/google/errors";
import type { GooglePlacesClient } from "@/lib/google/places-client";

import { GooglePlacesProvider } from "./google-provider";
import { PlacesProviderUnavailableError } from "./provider";

function fakeClient(overrides: Partial<Record<keyof GooglePlacesClient, () => Promise<unknown>>>) {
  return {
    searchNearby: vi.fn(overrides.searchNearby ?? (async () => ({ places: [] }))),
    getPlace: vi.fn(overrides.getPlace ?? (async () => ({ id: "ChIJx" }))),
    getPhotoMedia: vi.fn(overrides.getPhotoMedia ?? (async () => ({}))),
  } as unknown as GooglePlacesClient & {
    searchNearby: ReturnType<typeof vi.fn>;
    getPlace: ReturnType<typeof vi.fn>;
    getPhotoMedia: ReturnType<typeof vi.fn>;
  };
}

beforeEach(() => {
  for (const method of ["info", "warn", "error"] as const) {
    vi.spyOn(console, method).mockImplementation(() => {});
  }
});

const CENTER = { latitude: 11.553, longitude: 104.925 };

describe("GooglePlacesProvider.searchNearby", () => {
  it("sends a bounded cafe-only request", async () => {
    const client = fakeClient({});
    await new GooglePlacesProvider(client).searchNearby({ center: CENTER, radiusMeters: 3000 });

    expect(client.searchNearby).toHaveBeenCalledExactlyOnceWith({
      includedTypes: ["cafe", "coffee_shop"],
      maxResultCount: 20,
      rankPreference: "POPULARITY",
      languageCode: "en",
      locationRestriction: { circle: { center: CENTER, radius: 3000 } },
    });
  });

  it("returns an empty list when Google omits `places`", async () => {
    const provider = new GooglePlacesProvider(fakeClient({ searchNearby: async () => ({}) }));
    expect(await provider.searchNearby({ center: CENTER, radiusMeters: 1000 })).toEqual({
      places: [],
      attributions: [],
    });
  });

  it("normalizes, de-duplicates and skips malformed places", async () => {
    const provider = new GooglePlacesProvider(
      fakeClient({
        searchNearby: async () => ({
          places: [
            { id: "ChIJa", displayName: { text: "A" }, attributions: [{ provider: "P" }] },
            { id: "ChIJa", displayName: { text: "A duplicate" } },
            { displayName: { text: "no id" } },
            "garbage",
          ],
        }),
      }),
    );
    const result = await provider.searchNearby({ center: CENTER, radiusMeters: 1000 });
    expect(result).toEqual({
      places: [{ placeId: "ChIJa", name: "A", dataSource: "google" }],
      attributions: [{ provider: "P" }],
    });
  });

  it.each(["auth", "quota", "unavailable", "timeout", "bad_request"] as const)(
    "turns %s failures into a provider-neutral unavailable error",
    async (kind) => {
      const provider = new GooglePlacesProvider(
        fakeClient({
          searchNearby: async () => {
            throw new GooglePlacesError(kind, 500);
          },
        }),
      );
      await expect(provider.searchNearby({ center: CENTER, radiusMeters: 1000 })).rejects.toEqual(
        new PlacesProviderUnavailableError(`google:${kind}`),
      );
    },
  );

  it("rejects a response that is not the expected shape", async () => {
    const provider = new GooglePlacesProvider(fakeClient({ searchNearby: async () => ({ places: "x" }) }));
    await expect(provider.searchNearby({ center: CENTER, radiusMeters: 1000 })).rejects.toBeInstanceOf(
      PlacesProviderUnavailableError,
    );
  });
});

describe("GooglePlacesProvider.getPlaceDetails", () => {
  it("normalizes details", async () => {
    const provider = new GooglePlacesProvider(
      fakeClient({ getPlace: async () => ({ id: "ChIJx", displayName: { text: "X" } }) }),
    );
    expect(await provider.getPlaceDetails("ChIJx")).toEqual({
      place: { placeId: "ChIJx", name: "X", dataSource: "google", photos: [], reviews: [], amenities: {} },
      attributions: [],
    });
  });

  it.each(["not_found", "bad_request"] as const)("returns null on %s", async (kind) => {
    const provider = new GooglePlacesProvider(
      fakeClient({
        getPlace: async () => {
          throw new GooglePlacesError(kind);
        },
      }),
    );
    expect(await provider.getPlaceDetails("ChIJx")).toBeNull();
  });

  it("reports a key problem as unavailable, never as not found", async () => {
    const provider = new GooglePlacesProvider(
      fakeClient({
        getPlace: async () => {
          throw new GooglePlacesError("auth", 400, "INVALID_ARGUMENT", "API_KEY_INVALID");
        },
      }),
    );
    await expect(provider.getPlaceDetails("ChIJx")).rejects.toBeInstanceOf(PlacesProviderUnavailableError);
  });

  it("does not call Google for an invalid ID", async () => {
    const client = fakeClient({});
    expect(await new GooglePlacesProvider(client).getPlaceDetails("../x")).toBeNull();
    expect(client.getPlace).not.toHaveBeenCalled();
  });

  it("propagates outages as unavailable", async () => {
    const provider = new GooglePlacesProvider(
      fakeClient({
        getPlace: async () => {
          throw new GooglePlacesError("quota", 429);
        },
      }),
    );
    await expect(provider.getPlaceDetails("ChIJx")).rejects.toBeInstanceOf(PlacesProviderUnavailableError);
  });
});

describe("GooglePlacesProvider.getPhotoUrl", () => {
  const NAME = "places/ChIJx/photos/AbC";

  it("returns the Google-hosted image URL", async () => {
    const client = fakeClient({
      getPhotoMedia: async () => ({ name: `${NAME}/media`, photoUri: "https://lh3.googleusercontent.com/p/abc=s400" }),
    });
    expect(await new GooglePlacesProvider(client).getPhotoUrl(NAME, 400)).toBe(
      "https://lh3.googleusercontent.com/p/abc=s400",
    );
    expect(client.getPhotoMedia).toHaveBeenCalledWith(NAME, 400);
  });

  it("refuses to hand out a non-Google URL", async () => {
    const provider = new GooglePlacesProvider(
      fakeClient({ getPhotoMedia: async () => ({ photoUri: "https://evil.example/x.jpg" }) }),
    );
    await expect(provider.getPhotoUrl(NAME, 400)).rejects.toBeInstanceOf(PlacesProviderUnavailableError);
  });

  it("returns null for expired photo names", async () => {
    const provider = new GooglePlacesProvider(
      fakeClient({
        getPhotoMedia: async () => {
          throw new GooglePlacesError("bad_request", 400);
        },
      }),
    );
    expect(await provider.getPhotoUrl(NAME, 400)).toBeNull();
  });

  it("does not call Google for malformed names", async () => {
    const client = fakeClient({});
    expect(await new GooglePlacesProvider(client).getPhotoUrl("https://evil.example/x", 400)).toBeNull();
    expect(client.getPhotoMedia).not.toHaveBeenCalled();
  });
});
