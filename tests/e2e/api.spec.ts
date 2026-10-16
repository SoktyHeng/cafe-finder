import { expect, test } from "@playwright/test";

/** Server API behaviour against the real (fixture-mode) production server. */
test.describe("places API", () => {
  test("nearby search returns fixture data with no Google attribution", async ({ request }) => {
    const response = await request.post("/api/places/nearby", {
      data: { latitude: 11.553, longitude: 104.925, radiusMeters: 3000, purpose: "work" },
    });
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toBe("no-store");
    const body = await response.json();
    expect(body.source).toBe("fixture");
    expect(body.attributions).toEqual([]);
  });

  test("place details for a fixture ID", async ({ request }) => {
    const response = await request.get("/api/places/fixture-001");
    expect(response.status()).toBe(200);
    expect((await response.json()).place).toMatchObject({ placeId: "fixture-001", photos: [] });
  });

  test("unknown place and malformed photo requests fail safely", async ({ request }) => {
    expect((await request.get("/api/places/ChIJunknownPlace")).status()).toBe(404);
    const photo = await request.get("/api/places/photo?name=https://evil.example/x", { maxRedirects: 0 });
    expect(photo.status()).toBe(400);
    expect(await photo.json()).toEqual({
      error: { code: "VALIDATION_ERROR", message: "Invalid photo request." },
    });
  });

  test("fixture photos are never available", async ({ request }) => {
    const response = await request.get("/api/places/photo?name=places/fixture-001/photos/x", {
      maxRedirects: 0,
    });
    expect(response.status()).toBe(404);
  });
});
