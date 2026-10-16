import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { nearbyResponse, testCafe } from "@/test/recommendations";

import { ResultsWithMap } from "./results-with-map";

/**
 * The Maps JavaScript API can't run in jsdom, so the library is replaced by a
 * stand-in that renders markers as buttons and records map calls.
 */
const mapMock = vi.hoisted(() => ({
  status: "LOADED" as string,
  map: { fitBounds: vi.fn(), panTo: vi.fn() },
  providerRenders: 0,
}));

vi.mock("@vis.gl/react-google-maps", () => ({
  APILoadingStatus: {
    NOT_LOADED: "NOT_LOADED",
    LOADING: "LOADING",
    LOADED: "LOADED",
    FAILED: "FAILED",
    AUTH_FAILURE: "AUTH_FAILURE",
  },
  APIProvider: ({ children }: { children: ReactNode }) => {
    mapMock.providerRenders += 1;
    return <div data-testid="api-provider">{children}</div>;
  },
  Map: ({ children }: { children: ReactNode }) => <div data-testid="google-map">{children}</div>,
  AdvancedMarker: ({ title, onClick, children }: { title: string; onClick?: () => void; children: ReactNode }) =>
    onClick ? (
      <button type="button" data-testid="marker" onClick={onClick}>
        {title}
        {children}
      </button>
    ) : (
      <span data-testid="origin-marker">{title}</span>
    ),
  Pin: () => null,
  useApiLoadingStatus: () => mapMock.status,
  useMap: () => mapMock.map,
}));

function setViewport(wide: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes("min-width: 1280px") ? wide : false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

const CAFES = [
  testCafe({ placeId: "a", name: "Alpha", latitude: 11.55, longitude: 104.92, distanceMeters: 100, rating: 4.8, ratingCount: 500, openNow: true }),
  testCafe({ placeId: "b", name: "Bravo", latitude: 11.56, longitude: 104.93, distanceMeters: 900, rating: 4.4, ratingCount: 300, openNow: true }),
  testCafe({ placeId: "c", name: "No Coordinates", distanceMeters: undefined }),
];
const RECOMMENDATIONS = nearbyResponse(CAFES).results;
const ORIGIN = { latitude: 11.553, longitude: 104.925, label: "BKK1" };

function renderView({ apiKey }: { apiKey: string | undefined } = { apiKey: "browser-key" }) {
  render(
    <ResultsWithMap
      recommendations={RECOMMENDATIONS}
      origin={ORIGIN}
      mapConfig={{ apiKey, mapId: "DEMO_MAP_ID" }}
      detailsHref={(placeId) => `/cafes/${placeId}`}
    />,
  );
  return userEvent.setup();
}

const card = (name: string) => screen.getByRole("article", { name });

beforeEach(() => {
  mapMock.status = "LOADED";
  mapMock.providerRenders = 0;
  mapMock.map.fitBounds.mockClear();
  mapMock.map.panTo.mockClear();
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    callback(0);
    return 0;
  });
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ResultsWithMap on small screens", () => {
  beforeEach(() => setViewport(false));

  it("is list-first and does not load Google Maps until the map is requested", () => {
    renderView();
    expect(screen.getByRole("button", { name: "List" })).toHaveAttribute("aria-pressed", "true");
    expect(card("Alpha")).toBeVisible();
    expect(screen.queryByTestId("api-provider")).not.toBeInTheDocument();
    expect(mapMock.providerRenders).toBe(0);
  });

  it("shows the map with numbered markers and a search-centre marker", async () => {
    const user = renderView();
    await user.click(screen.getByRole("button", { name: "Map" }));

    expect(await screen.findByTestId("google-map")).toBeInTheDocument();
    expect(screen.getAllByTestId("marker").map((marker) => marker.textContent)).toEqual(["1. Alpha", "2. Bravo"]);
    expect(screen.getByTestId("origin-marker")).toHaveTextContent("Search centre: BKK1");
    expect(screen.queryByRole("list", { name: "Cafes, best match first" })).not.toBeInTheDocument();
    expect(mapMock.map.fitBounds).toHaveBeenCalledOnce();
  });

  it("selecting a marker shows that cafe under the map, and the list remembers it", async () => {
    const user = renderView();
    await user.click(screen.getByRole("button", { name: "Map" }));
    await user.click(await screen.findByRole("button", { name: "2. Bravo" }));

    const selected = screen.getByRole("region", { name: "Selected cafe" });
    expect(within(selected).getByRole("heading", { name: "Bravo" })).toBeInTheDocument();
    expect(mapMock.map.panTo).toHaveBeenLastCalledWith({ lat: 11.56, lng: 104.93 });

    await user.click(screen.getByRole("button", { name: "List" }));
    expect(card("Bravo")).toHaveAttribute("data-selected", "true");
    // The map stays mounted (hidden) so switching back doesn't reload it.
    expect(screen.getByTestId("api-provider")).toBeInTheDocument();
  });

  it("'Show on map' switches to the map with that cafe selected", async () => {
    const user = renderView();
    await user.click(within(card("Bravo")).getByRole("button", { name: /show on map/i }));

    expect(screen.getByRole("button", { name: "Map" })).toHaveAttribute("aria-pressed", "true");
    expect(await screen.findByTestId("google-map")).toBeInTheDocument();
    expect(mapMock.map.panTo).toHaveBeenLastCalledWith({ lat: 11.56, lng: 104.93 });
  });

  it("offers no map button for cafes without coordinates", () => {
    renderView();
    expect(within(card("No Coordinates")).queryByRole("button", { name: /show on map/i })).not.toBeInTheDocument();
  });
});

describe("ResultsWithMap on wide screens", () => {
  beforeEach(() => setViewport(true));

  it("shows list and map side by side without a toggle", async () => {
    renderView();
    expect(await screen.findByTestId("google-map")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Cafes, best match first" })).toBeInTheDocument();
  });

  it("marker click highlights, scrolls to and focuses the card", async () => {
    const user = renderView();
    await user.click(await screen.findByRole("button", { name: "1. Alpha" }));

    expect(card("Alpha")).toHaveAttribute("data-selected", "true");
    expect(card("Alpha")).toHaveFocus();
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it("card 'Show on map' pans the map and marks the card", async () => {
    const user = renderView();
    await screen.findByTestId("google-map");
    await user.click(within(card("Bravo")).getByRole("button", { name: /show on map/i }));

    expect(mapMock.map.panTo).toHaveBeenLastCalledWith({ lat: 11.56, lng: 104.93 });
    expect(within(card("Bravo")).getByRole("button", { name: /show on map/i })).toHaveAttribute("aria-pressed", "true");
  });

  it("falls back without a browser key, keeping the list usable", () => {
    renderView({ apiKey: undefined });
    expect(screen.getByTestId("map-unavailable")).toHaveAttribute("data-reason", "not-configured");
    expect(screen.queryByTestId("api-provider")).not.toBeInTheDocument();
    expect(card("Alpha")).toBeVisible();
  });

  it.each(["AUTH_FAILURE", "FAILED"])("falls back when Maps reports %s", async (status) => {
    mapMock.status = status;
    renderView();
    expect(await screen.findByTestId("map-unavailable")).toHaveAttribute("data-reason", "failed");
    expect(card("Alpha")).toBeVisible();
  });

  it("shows a loading placeholder until the API has loaded", async () => {
    mapMock.status = "LOADING";
    renderView();
    expect(await screen.findByTestId("cafe-map")).toBeInTheDocument();
    await act(async () => {});
    expect(screen.queryByTestId("map-unavailable")).not.toBeInTheDocument();
  });
});
