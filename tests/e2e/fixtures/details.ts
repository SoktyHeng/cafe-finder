/** A mocked Google details response in the normalized DTO shape (no Google call is made). */
export const GOOGLE_DETAILS = {
  place: {
    placeId: "ChIJmockDetails01",
    name: "Mocked Google Cafe",
    address: "Mocked address, Phnom Penh",
    latitude: 11.5551,
    longitude: 104.9262,
    rating: 4.6,
    ratingCount: 412,
    priceLevel: "moderate",
    openNow: true,
    businessStatus: "operational",
    googleMapsUri: "https://maps.google.com/?cid=42",
    weekdayDescriptions: [
      "Monday: 7:00 AM – 9:00 PM",
      "Tuesday: 7:00 AM – 9:00 PM",
      "Wednesday: 7:00 AM – 9:00 PM",
      "Thursday: 7:00 AM – 9:00 PM",
      "Friday: 7:00 AM – 9:00 PM",
      "Saturday: 8:00 AM – 10:00 PM",
      "Sunday: 8:00 AM – 10:00 PM",
    ],
    utcOffsetMinutes: 420,
    websiteUri: "https://mocked-cafe.example/",
    phoneNumber: "012 345 678",
    photos: [
      { name: "places/ChIJmockDetails01/photos/one", widthPx: 800, heightPx: 600, authorAttributions: [{ displayName: "Mock Photographer", uri: "https://maps.google.com/maps/contrib/1" }] },
      { name: "places/ChIJmockDetails01/photos/two", widthPx: 800, heightPx: 600, authorAttributions: [{ displayName: "Second Photographer" }] },
    ],
    reviews: [
      {
        authorName: "Mock Reviewer",
        authorUri: "https://www.google.com/maps/contrib/9",
        rating: 5,
        relativePublishTime: "a week ago",
        text: "Mocked review text.",
        translated: false,
      },
    ],
    amenities: { dineIn: true, takeout: true, outdoorSeating: false },
    dataSource: "google",
  },
  fetchedAt: "2026-10-16T00:00:00.000Z",
  source: "google",
  attributions: [],
};

/** 1×1 transparent PNG standing in for Google photo media. */
export const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

