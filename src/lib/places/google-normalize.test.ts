import { describe, expect, it } from "vitest";

import {
  collectAttributions,
  normalizeNearbyPlace,
  normalizePlaceDetails,
  parseGooglePlace,
} from "./google-normalize";
import { cafeDetailsSchema, cafePlaceSchema } from "./schemas";

const parse = (raw: unknown) => {
  const place = parseGooglePlace(raw);
  if (!place) throw new Error("expected a parsable place");
  return place;
};

const FULL = {
  id: "ChIJ_full-1",
  displayName: { text: "  Real Cafe  ", languageCode: "en" },
  location: { latitude: 11.5551, longitude: 104.9262 },
  shortFormattedAddress: "St 51, Phnom Penh",
  formattedAddress: "St 51, Phnom Penh, Cambodia",
  businessStatus: "OPERATIONAL",
  googleMapsUri: "https://maps.google.com/?cid=123",
  rating: 4.6,
  userRatingCount: 412,
  priceLevel: "PRICE_LEVEL_MODERATE",
  currentOpeningHours: {
    openNow: false,
    weekdayDescriptions: ["Monday: 7:00 AM – 9:00 PM"],
  },
  utcOffsetMinutes: 420,
  websiteUri: "https://example.com/",
  nationalPhoneNumber: "012 345 678",
  photos: [
    {
      name: "places/ChIJ_full-1/photos/AbC-1_x",
      widthPx: 4032,
      heightPx: 3024,
      authorAttributions: [
        { displayName: "A Photographer", uri: "https://maps.google.com/maps/contrib/1", photoUri: "//lh3" },
      ],
    },
  ],
  attributions: [{ provider: "Data Co", providerUri: "https://data.example/" }],
  someNewField: { ignored: true },
};

describe("normalizeNearbyPlace", () => {
  it("maps every requested field explicitly", () => {
    const cafe = normalizeNearbyPlace(parse(FULL));

    expect(cafe).toEqual({
      placeId: "ChIJ_full-1",
      name: "Real Cafe",
      latitude: 11.5551,
      longitude: 104.9262,
      address: "St 51, Phnom Penh",
      rating: 4.6,
      ratingCount: 412,
      priceLevel: "moderate",
      openNow: false,
      businessStatus: "operational",
      googleMapsUri: "https://maps.google.com/?cid=123",
      dataSource: "google",
    });
    expect(cafePlaceSchema.safeParse(cafe).success).toBe(true);
  });

  it("leaves missing fields unknown instead of defaulting them", () => {
    const cafe = normalizeNearbyPlace(parse({ id: "ChIJ_min" }));
    expect(cafe).toEqual({ placeId: "ChIJ_min", dataSource: "google" });
    expect("openNow" in cafe).toBe(false);
    expect("rating" in cafe).toBe(false);
  });

  it("keeps openNow unknown when hours exist but openNow is absent", () => {
    const cafe = normalizeNearbyPlace(
      parse({ id: "ChIJ_h", currentOpeningHours: { weekdayDescriptions: [] } }),
    );
    expect(cafe.openNow).toBeUndefined();
  });

  it("drops unspecified or unknown enum values", () => {
    const cafe = normalizeNearbyPlace(
      parse({
        id: "ChIJ_e",
        priceLevel: "PRICE_LEVEL_UNSPECIFIED",
        businessStatus: "FUTURE_OPENING",
      }),
    );
    expect(cafe.priceLevel).toBeUndefined();
    expect(cafe.businessStatus).toBeUndefined();
  });

  it("drops out-of-range ratings, counts and coordinates", () => {
    const cafe = normalizeNearbyPlace(
      parse({
        id: "ChIJ_r",
        rating: 7,
        userRatingCount: -1,
        location: { latitude: 120, longitude: 104 },
      }),
    );
    expect(cafe.rating).toBeUndefined();
    expect(cafe.ratingCount).toBeUndefined();
    expect(cafe.latitude).toBeUndefined();
  });

  it("keeps a zero review count distinct from unknown", () => {
    expect(normalizeNearbyPlace(parse({ id: "ChIJ_z", userRatingCount: 0 })).ratingCount).toBe(0);
  });

  it.each([
    "javascript:alert(1)",
    "http://maps.google.com/?cid=1",
    "https://evil.example/maps",
    "https://www.google.com/search?q=x",
    "https://user:pw@maps.google.com/",
  ])("rejects unsafe Google Maps link %s", (googleMapsUri) => {
    expect(normalizeNearbyPlace(parse({ id: "ChIJ_u", googleMapsUri })).googleMapsUri).toBeUndefined();
  });

  it("falls back to the full address and ignores blank names", () => {
    const cafe = normalizeNearbyPlace(
      parse({ id: "ChIJ_a", formattedAddress: "Full address", displayName: { text: "  " } }),
    );
    expect(cafe.address).toBe("Full address");
    expect(cafe.name).toBeUndefined();
  });
});

describe("parseGooglePlace", () => {
  it.each([null, {}, { id: 5 }, { id: "" }, { id: "bad id/../" }])("rejects %o", (raw) => {
    expect(parseGooglePlace(raw)).toBeUndefined();
  });
});

describe("normalizePlaceDetails", () => {
  it("adds hours, contact data and photos with author credits", () => {
    const details = normalizePlaceDetails(parse(FULL));

    expect(details).toMatchObject({
      address: "St 51, Phnom Penh",
      weekdayDescriptions: ["Monday: 7:00 AM – 9:00 PM"],
      utcOffsetMinutes: 420,
      websiteUri: "https://example.com/",
      phoneNumber: "012 345 678",
      photos: [
        {
          name: "places/ChIJ_full-1/photos/AbC-1_x",
          widthPx: 4032,
          heightPx: 3024,
          authorAttributions: [
            { displayName: "A Photographer", uri: "https://maps.google.com/maps/contrib/1" },
          ],
        },
      ],
    });
    expect(cafeDetailsSchema.safeParse(details).success).toBe(true);
  });

  it("returns an empty photo list and no hours when absent", () => {
    const details = normalizePlaceDetails(parse({ id: "ChIJ_none" }));
    expect(details.photos).toEqual([]);
    expect(details.weekdayDescriptions).toBeUndefined();
    expect(details.websiteUri).toBeUndefined();
  });

  it("drops invalid photo names, unsafe links and caps the photo count", () => {
    const details = normalizePlaceDetails(
      parse({
        id: "ChIJ_p",
        websiteUri: "javascript:alert(1)",
        photos: [
          { name: "../../etc/passwd" },
          ...Array.from({ length: 8 }, (_, index) => ({
            name: `places/ChIJ_p/photos/p${index}`,
            authorAttributions: [{ displayName: "X", uri: "javascript:alert(1)" }, { uri: "https://x" }],
          })),
        ],
      }),
    );
    expect(details.websiteUri).toBeUndefined();
    expect(details.photos).toHaveLength(5);
    expect(details.photos[0]?.name).toBe("places/ChIJ_p/photos/p0");
    expect(details.photos[0]?.authorAttributions).toEqual([{ displayName: "X" }]);
  });
});

describe("collectAttributions", () => {
  it("de-duplicates providers and drops unsafe links", () => {
    expect(
      collectAttributions([
        parse({ id: "a", attributions: [{ provider: "Data Co", providerUri: "https://data.example/" }] }),
        parse({ id: "b", attributions: [{ provider: "Data Co" }, { provider: "Other", providerUri: "ftp://x" }, {}] }),
      ]),
    ).toEqual([
      { provider: "Data Co", providerUri: "https://data.example/" },
      { provider: "Other" },
    ]);
  });
});

describe("normalizePlaceDetails: reviews", () => {
  // Shape per Places API (New) Review reference (verified 2026-10-16).
  const review = (overrides: Record<string, unknown> = {}) => ({
    name: "places/ChIJ_r/reviews/abc",
    relativePublishTimeDescription: "2 weeks ago",
    rating: 5,
    text: { text: "  Great flat white.  ", languageCode: "en" },
    originalText: { text: "Great flat white.", languageCode: "en" },
    authorAttribution: {
      displayName: "Sokha",
      uri: "https://www.google.com/maps/contrib/123",
      photoUri: "https://lh3.googleusercontent.com/a/photo",
    },
    publishTime: "2026-09-30T08:15:30.123456789Z",
    googleMapsUri: "https://www.google.com/maps/reviews/data=abc",
    ...overrides,
  });

  it("keeps Google's text with full author attribution", () => {
    const [first] = normalizePlaceDetails(parse({ id: "ChIJ_r", reviews: [review()] })).reviews;
    expect(first).toEqual({
      authorName: "Sokha",
      authorUri: "https://www.google.com/maps/contrib/123",
      authorPhotoUri: "https://lh3.googleusercontent.com/a/photo",
      rating: 5,
      relativePublishTime: "2 weeks ago",
      publishTime: "2026-09-30T08:15:30.123Z",
      text: "Great flat white.",
      translated: false,
      googleMapsUri: "https://www.google.com/maps/reviews/data=abc",
    });
  });

  it("flags translated reviews", () => {
    const [first] = normalizePlaceDetails(
      parse({ id: "ChIJ_r", reviews: [review({ originalText: { text: "…", languageCode: "km" } })] }),
    ).reviews;
    expect(first?.translated).toBe(true);
  });

  it("drops reviews without an author, unsafe links and bad ratings", () => {
    const { reviews } = normalizePlaceDetails(
      parse({
        id: "ChIJ_r",
        reviews: [
          review({ authorAttribution: { uri: "https://x" } }),
          "garbage",
          review({
            rating: 9,
            authorAttribution: { displayName: "A", uri: "javascript:alert(1)", photoUri: "https://evil.example/p.png" },
            googleMapsUri: "https://evil.example/",
          }),
        ],
      }),
    );
    expect(reviews).toEqual([{ authorName: "A", relativePublishTime: "2 weeks ago", publishTime: "2026-09-30T08:15:30.123Z", text: "Great flat white.", translated: false }]);
  });

  it("caps reviews at five", () => {
    const { reviews } = normalizePlaceDetails(
      parse({ id: "ChIJ_r", reviews: Array.from({ length: 8 }, () => review()) }),
    );
    expect(reviews).toHaveLength(5);
  });
});

describe("normalizePlaceDetails: amenities", () => {
  it("keeps Google's yes/no answers and omits unknowns", () => {
    const { amenities } = normalizePlaceDetails(
      parse({
        id: "ChIJ_a",
        dineIn: true,
        outdoorSeating: false,
        servesCoffee: true,
        accessibilityOptions: { wheelchairAccessibleEntrance: true },
        paymentOptions: { acceptsCreditCards: false, acceptsNfc: true },
      }),
    );
    expect(amenities).toEqual({
      dineIn: true,
      outdoorSeating: false,
      servesCoffee: true,
      wheelchairAccessibleEntrance: true,
      acceptsCreditCards: false,
      acceptsNfc: true,
    });
    expect("takeout" in amenities).toBe(false);
  });

  it("never invents Wi-Fi or noise attributes", () => {
    const { amenities } = normalizePlaceDetails(parse({ id: "ChIJ_a", wifi: true, quiet: true }));
    expect(amenities).toEqual({});
  });
});
