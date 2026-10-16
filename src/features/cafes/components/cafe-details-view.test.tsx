import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PlaceDetailsResponse } from "@/lib/places/schemas";

import { groupAmenities } from "../amenity-labels";
import { boundsFor } from "../map-geometry";
import { CafeDetailsView, backLinkFrom } from "./cafe-details-view";

const nav = vi.hoisted(() => ({ placeId: "ChIJdetails1", from: null as string | null }));

vi.mock("next/navigation", () => ({
  useParams: () => ({ placeId: nav.placeId }),
  useSearchParams: () => new URLSearchParams(nav.from ? { from: nav.from } : {}),
}));

const GOOGLE_DETAILS: PlaceDetailsResponse = {
  place: {
    placeId: "ChIJdetails1",
    name: "Real Cafe",
    address: "St 51, Phnom Penh",
    latitude: 11.5551,
    longitude: 104.9262,
    rating: 4.6,
    ratingCount: 412,
    priceLevel: "moderate",
    openNow: true,
    businessStatus: "operational",
    googleMapsUri: "https://maps.google.com/?cid=1",
    weekdayDescriptions: ["Monday: 7:00 AM – 9:00 PM", "Tuesday: 7:00 AM – 9:00 PM"],
    utcOffsetMinutes: 420,
    websiteUri: "https://realcafe.example/",
    phoneNumber: "012 345 678",
    photos: [
      { name: "places/ChIJdetails1/photos/p1", widthPx: 800, heightPx: 600, authorAttributions: [{ displayName: "Photographer One", uri: "https://maps.google.com/maps/contrib/1" }] },
      { name: "places/ChIJdetails1/photos/p2", authorAttributions: [{ displayName: "Photographer Two" }] },
      { name: "places/ChIJdetails1/photos/p3", authorAttributions: [] },
    ],
    reviews: [
      {
        authorName: "Sokha",
        authorUri: "https://www.google.com/maps/contrib/123",
        authorPhotoUri: "https://lh3.googleusercontent.com/a/photo",
        rating: 5,
        relativePublishTime: "2 weeks ago",
        text: "Great flat white.",
        translated: true,
        googleMapsUri: "https://www.google.com/maps/reviews/1",
      },
    ],
    amenities: { dineIn: true, outdoorSeating: false, wheelchairAccessibleEntrance: true },
    dataSource: "google",
  },
  fetchedAt: "2026-10-16T00:00:00.000Z",
  source: "google",
  attributions: [{ provider: "Example Data Co" }],
};

const FIXTURE_DETAILS: PlaceDetailsResponse = {
  place: { placeId: "fixture-001", name: "Lantern Bean Demo Cafe", rating: 4.6, ratingCount: 412, dataSource: "fixture", photos: [], reviews: [], amenities: {} },
  fetchedAt: "2026-10-16T00:00:00.000Z",
  source: "fixture",
  attributions: [],
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
let uniqueId = 0;

function renderDetails(placeId: string, response: Response | (() => Response), from: string | null = null) {
  // Unique IDs keep the shared in-flight request map from leaking between tests.
  nav.placeId = placeId;
  nav.from = from;
  fetchMock.mockImplementation(async () => (typeof response === "function" ? response() : response.clone()));
  render(<CafeDetailsView />);
  return userEvent.setup();
}

beforeEach(() => {
  uniqueId += 1;
  fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const googleId = () => `ChIJdetails${uniqueId}`;
const withId = (body: PlaceDetailsResponse, placeId: string): PlaceDetailsResponse => ({
  ...body,
  place: { ...body.place, placeId },
});

describe("CafeDetailsView: Google place", () => {
  it("shows facts, attribution and official action links", async () => {
    const id = googleId();
    renderDetails(id, json(withId(GOOGLE_DETAILS, id)), "area=bkk1&purpose=work&radius=3000");

    expect(await screen.findByRole("heading", { level: 1, name: "Real Cafe" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(`/api/places/${id}`, { method: "GET" });
    expect(screen.getByText("4.6 Google rating from 412 reviews")).toBeInTheDocument();
    expect(screen.getByText("Open now (according to Google)")).toBeInTheDocument();
    expect(screen.getByText(/from Boeung Keng Kang 1 \(BKK1\) \(straight line\)/)).toBeInTheDocument();
    expect(screen.getByTestId("google-maps-attribution")).toHaveTextContent("Google Maps · Data: Example Data Co");

    expect(screen.getByRole("link", { name: /directions/i })).toHaveAttribute(
      "href",
      `https://www.google.com/maps/dir/?api=1&destination=Real+Cafe&destination_place_id=${id}`,
    );
    expect(screen.getByRole("link", { name: /open in google maps/i })).toHaveAttribute("href", "https://maps.google.com/?cid=1");
    expect(screen.getByRole("link", { name: /website/i })).toHaveAttribute("rel", "noopener noreferrer nofollow");
    expect(screen.getByRole("link", { name: "012 345 678" })).toHaveAttribute("href", "tel:012345678");
    expect(screen.getByRole("link", { name: /back to results/i })).toHaveAttribute(
      "href",
      "/discover?area=bkk1&purpose=work&radius=3000",
    );
  });

  it("loads one photo with its credit, and the rest only on request", async () => {
    const id = googleId();
    const user = renderDetails(id, json(withId(GOOGLE_DETAILS, id)));

    const photos = await screen.findByRole("list", { name: "Photos" });
    expect(within(photos).getAllByRole("img")).toHaveLength(1);
    expect(within(photos).getByRole("img")).toHaveAttribute(
      "src",
      "/api/places/photo?name=places%2FChIJdetails1%2Fphotos%2Fp1&maxWidthPx=800",
    );
    expect(within(photos).getByRole("link", { name: "Photographer One" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show 2 more photos" }));
    expect(within(photos).getAllByRole("img")).toHaveLength(3);
    expect(within(photos).getByText("Photographer Two")).toBeInTheDocument();
  });

  it("shows Google reviews with author attribution and translation notice", async () => {
    const id = googleId();
    renderDetails(id, json(withId(GOOGLE_DETAILS, id)));

    const reviews = await screen.findByRole("list", { name: "Google reviews" });
    expect(within(reviews).getByRole("link", { name: "Sokha" })).toHaveAttribute("href", "https://www.google.com/maps/contrib/123");
    expect(within(reviews).getByText("Great flat white.")).toBeInTheDocument();
    expect(within(reviews).getByText("Translated by Google")).toBeInTheDocument();
    expect(within(reviews).getByText(/5 of 5/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /see all reviews on google maps/i })).toBeInTheDocument();
  });

  it("lists amenities as yes / no / not listed and never claims Wi-Fi", async () => {
    const id = googleId();
    renderDetails(id, json(withId(GOOGLE_DETAILS, id)));

    const amenities = await screen.findByRole("list", { name: "Amenities according to Google" });
    expect(within(amenities).getByText(/Dine-in/)).toHaveTextContent("Dine-in: yes");
    expect(within(amenities).getByText(/Outdoor seating/)).toHaveTextContent("Not available: Outdoor seating (no)");
    expect(screen.getByText(/Not listed by Google: takeaway/)).toBeInTheDocument();
    expect(screen.getByText(/Wi-Fi and noise level aren.t provided by Google/)).toBeInTheDocument();
    expect(amenities).not.toHaveTextContent(/wi-?fi/i);
  });

  it("shows opening hours with a freshness caveat", async () => {
    const id = googleId();
    renderDetails(id, json(withId(GOOGLE_DETAILS, id)));
    const hours = await screen.findByRole("list", { name: "Opening hours" });
    expect(within(hours).getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText(/in the cafe.s local time\. They can change/)).toBeInTheDocument();
  });
});

describe("CafeDetailsView: states", () => {
  it("labels demo cafes and offers no photos, reviews or directions", async () => {
    renderDetails("fixture-001", json(FIXTURE_DETAILS));

    expect(await screen.findByRole("heading", { level: 1, name: "Lantern Bean Demo Cafe" })).toBeInTheDocument();
    expect(screen.getByTestId("demo-details-notice")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /directions/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Photos" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Reviews from Google" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("google-maps-attribution")).not.toBeInTheDocument();
    expect(screen.getByText("Opening hours unknown.")).toBeInTheDocument();
  });

  it("shows a skeleton while loading", () => {
    nav.placeId = googleId();
    fetchMock.mockImplementation(() => new Promise(() => {}));
    render(<CafeDetailsView />);
    expect(screen.getByTestId("details-skeleton")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Loading cafe details");
  });

  it("shows not found for unknown places", async () => {
    renderDetails(googleId(), json({ error: { code: "NOT_FOUND", message: "x" } }, 404));
    expect(await screen.findByRole("heading", { name: /couldn.t find that cafe/i })).toBeInTheDocument();
    for (const link of screen.getAllByRole("link", { name: "Search for cafes" })) {
      expect(link).toHaveAttribute("href", "/discover");
    }
  });

  it("never calls the API for an invalid place ID", () => {
    renderDetails("bad id/../x", json(FIXTURE_DETAILS));
    expect(screen.getByRole("heading", { name: /couldn.t find that cafe/i })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("explains upstream errors and retries on request", async () => {
    const id = googleId();
    let calls = 0;
    const user = renderDetails(id, () => {
      calls += 1;
      return calls === 1
        ? json({ error: { code: "UPSTREAM_UNAVAILABLE", message: "x" } }, 503)
        : json(withId(GOOGLE_DETAILS, id));
    });

    expect(await screen.findByRole("alert")).toHaveTextContent("temporarily unavailable");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Real Cafe" })).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });
});

describe("backLinkFrom", () => {
  it.each([
    [null],
    ["https://evil.example/"],
    ["javascript:alert(1)"],
    ["area=atlantis"],
  ])("falls back to /discover for %s", (from) => {
    expect(backLinkFrom(from)).toEqual({ href: "/discover", label: "Search for cafes" });
  });

  it("re-serializes a valid search instead of echoing the input", () => {
    const back = backLinkFrom("radius=5000&area=riverside&utm=x&purpose=date");
    expect(back.href).toBe("/discover?area=riverside&purpose=date&radius=5000");
    expect(back.origin?.label).toBe("Riverside (Sisowath Quay)");
  });
});

describe("helpers", () => {
  it("groups amenities in a stable order", () => {
    expect(groupAmenities({ outdoorSeating: false, dineIn: true }).yes).toEqual(["dineIn"]);
    expect(groupAmenities({ outdoorSeating: false, dineIn: true }).no).toEqual(["outdoorSeating"]);
    expect(groupAmenities({}).unknown.length).toBeGreaterThan(10);
  });

  it("computes map bounds only for distinct points", () => {
    expect(boundsFor([{ latitude: 1, longitude: 2 }])).toBeUndefined();
    expect(boundsFor([{ latitude: 1, longitude: 2 }, { latitude: 1, longitude: 2 }])).toBeUndefined();
    expect(
      boundsFor([
        { latitude: 11.5, longitude: 104.9 },
        { latitude: 11.6, longitude: 104.8 },
      ]),
    ).toEqual({ north: 11.6, south: 11.5, east: 104.9, west: 104.8 });
  });
});
