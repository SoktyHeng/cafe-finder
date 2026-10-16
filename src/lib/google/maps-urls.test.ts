import { describe, expect, it } from "vitest";

import { directionsUrl } from "./maps-urls";

describe("directionsUrl", () => {
  it("builds an official directions link with name and place ID, and no origin", () => {
    const url = directionsUrl({
      placeId: "ChIJabc_1",
      name: "Kaifun St.288 & Co",
      latitude: 11.55,
      longitude: 104.92,
      dataSource: "google",
    });
    expect(url).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=Kaifun+St.288+%26+Co&destination_place_id=ChIJabc_1",
    );
    expect(url).not.toContain("origin");
  });

  it("falls back to encoded coordinates when the name is unknown", () => {
    expect(
      directionsUrl({ placeId: "ChIJx", latitude: 11.5, longitude: 104.9, dataSource: "google" }),
    ).toBe("https://www.google.com/maps/dir/?api=1&destination=11.5%2C104.9&destination_place_id=ChIJx");
  });

  it("returns nothing without a destination or for demo cafes", () => {
    expect(directionsUrl({ placeId: "ChIJx", dataSource: "google" })).toBeUndefined();
    expect(
      directionsUrl({ placeId: "fixture-001", name: "Demo", latitude: 11.5, longitude: 104.9, dataSource: "fixture" }),
    ).toBeUndefined();
  });
});
