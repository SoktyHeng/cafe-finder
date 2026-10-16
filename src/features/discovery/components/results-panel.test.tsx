import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { DiscoveryRequest } from "@/lib/discovery/request-schema";
import { TEST_REQUEST, nearbyResponse, testCafe } from "@/test/recommendations";

import type { NearbySearchState } from "../hooks/use-nearby-search";
import { ResultsPanel, cafeDetailsHref, describeExclusions } from "./results-panel";

const REQUEST: DiscoveryRequest = { ...TEST_REQUEST, minRating: 4.5, preferWifi: true };

const NEAR = testCafe({ placeId: "fixture-001", name: "Near", distanceMeters: 200, rating: 4.6, ratingCount: 300, openNow: true });
const FAR = testCafe({ placeId: "fixture-002", name: "Far", distanceMeters: 2900, rating: 4.6, ratingCount: 300, openNow: true });

function renderPanel(state: NearbySearchState, request: DiscoveryRequest = REQUEST) {
  const onRetry = vi.fn();
  const onEditSearch = vi.fn();
  const onRelax = vi.fn();
  render(
    <ResultsPanel
      state={state}
      request={request}
      locationLabel="BKK1"
      origin={{ latitude: 11.553, longitude: 104.925 }}
      backQuery="area=bkk1&purpose=work&radius=3000"
      mapConfig={{ apiKey: undefined, mapId: "DEMO_MAP_ID" }}
      maxRadiusMeters={15_000}
      onRetry={onRetry}
      onEditSearch={onEditSearch}
      onRelax={onRelax}
    />,
  );
  return { onRetry, onEditSearch, onRelax, user: userEvent.setup() };
}

const cardNames = () =>
  within(screen.getByRole("list", { name: "Cafes, best match first" }))
    .getAllByRole("article")
    .map((article) => document.getElementById(article.getAttribute("aria-labelledby") ?? "")?.textContent);

describe("ResultsPanel", () => {
  it("prompts for a search when idle", () => {
    renderPanel({ status: "idle" });
    expect(screen.getByText(/press/i)).toHaveTextContent("Find My Cafe");
  });

  it("shows a skeleton and announces loading", () => {
    renderPanel({ status: "loading" });
    expect(screen.getByTestId("results-skeleton")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Searching for cafes");
  });

  it("lists ranked results in server order and explains the ranking", () => {
    renderPanel({ status: "done", outcome: { ok: true, data: nearbyResponse([FAR, NEAR], {}, REQUEST) } });

    expect(screen.getByRole("heading", { name: "2 cafes within 3 km of BKK1" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("2 cafes found, best match first.");
    expect(screen.getByText(/Best match first, ranked by rating, distance, opening status/)).toBeInTheDocument();
    expect(screen.getByText(/can.t verify count as neutral/)).toBeInTheDocument();
    expect(screen.getByTestId("demo-results-notice")).toBeInTheDocument();
    expect(cardNames()).toEqual(["Near", "Far"]);
    expect(screen.getByRole("link", { name: /details: near/i })).toHaveAttribute(
      "href",
      "/cafes/fixture-001?from=area%3Dbkk1%26purpose%3Dwork%26radius%3D3000",
    );
    expect(screen.getAllByText("Wi-Fi")).toHaveLength(2);
  });

  it("mentions price level in the ranking note only when a budget is set", () => {
    renderPanel(
      { status: "done", outcome: { ok: true, data: nearbyResponse([NEAR], {}, { budget: "under_5" }) } },
      { ...TEST_REQUEST, budget: "under_5" },
    );
    expect(screen.getByText(/opening status and price level/)).toBeInTheDocument();
  });

  it("shows Google Maps attribution and an hours caveat for Google results", () => {
    renderPanel({
      status: "done",
      outcome: {
        ok: true,
        data: nearbyResponse([{ ...NEAR, dataSource: "google" }], {
          source: "google",
          attributions: [{ provider: "Data Co" }],
        }),
      },
    });
    expect(screen.getByTestId("google-maps-attribution")).toHaveTextContent("Google Maps · Data: Data Co");
    expect(screen.getByText(/hours can change/i)).toBeInTheDocument();
    expect(screen.queryByTestId("demo-results-notice")).not.toBeInTheDocument();
  });

  it("does not show Google attribution for demo data", () => {
    renderPanel({ status: "done", outcome: { ok: true, data: nearbyResponse([NEAR]) } });
    expect(screen.queryByTestId("google-maps-attribution")).not.toBeInTheDocument();
  });

  it("explains an empty result and offers one-click relaxations", async () => {
    const { onRelax, onEditSearch, user } = renderPanel(
      {
        status: "done",
        outcome: {
          ok: true,
          data: nearbyResponse([], { excluded: { belowMinRating: 2, closedNow: 1, permanentlyClosed: 0 } }),
        },
      },
      { ...REQUEST, openNowOnly: true },
    );

    expect(screen.getByRole("heading", { name: "No cafes found within 3 km of BKK1" })).toBeInTheDocument();
    expect(
      screen.getByText("Hidden by your filters: 2 cafes rated below 4.5, 1 cafe closed now."),
    ).toBeInTheDocument();

    const options = within(screen.getByRole("list", { name: "Ways to widen your search" }));
    await user.click(options.getByRole("button", { name: "Include 2 cafes rated below 4.5" }));
    expect(onRelax).toHaveBeenLastCalledWith({ kind: "removeMinRating" });
    await user.click(options.getByRole("button", { name: "Include 1 cafe closed right now" }));
    expect(onRelax).toHaveBeenLastCalledWith({ kind: "includeClosed" });
    await user.click(options.getByRole("button", { name: "Search within 5 km" }));
    expect(onRelax).toHaveBeenLastCalledWith({ kind: "widenRadius", radiusMeters: 5000 });

    await user.click(screen.getByRole("button", { name: "Edit search" }));
    expect(onEditSearch).toHaveBeenCalledOnce();
  });

  it.each([
    ["RATE_LIMITED", /too many searches/i, true],
    ["UPSTREAM_UNAVAILABLE", /temporarily unavailable/i, true],
    ["NETWORK_ERROR", /can't reach/i, true],
    ["VALIDATION_ERROR", /invalid/i, false],
  ] as const)("shows %s as an alert", async (code, title, canRetry) => {
    const { onRetry, user } = renderPanel({ status: "done", outcome: { ok: false, code } });

    expect(screen.getByRole("alert")).toHaveTextContent(title);
    const retry = screen.queryByRole("button", { name: "Try again" });
    if (canRetry) {
      await user.click(retry as HTMLElement);
      expect(onRetry).toHaveBeenCalledOnce();
    } else {
      expect(retry).not.toBeInTheDocument();
    }
  });
});

describe("cafeDetailsHref", () => {
  it("encodes the place ID and the originating search", () => {
    expect(cafeDetailsHref("ChIJ_a-1", "area=bkk1&radius=3000")).toBe("/cafes/ChIJ_a-1?from=area%3Dbkk1%26radius%3D3000");
    expect(cafeDetailsHref("ChIJ_a-1", "")).toBe("/cafes/ChIJ_a-1");
  });
});

describe("describeExclusions", () => {
  it("returns null when nothing was hidden", () => {
    expect(
      describeExclusions({ belowMinRating: 0, closedNow: 0, permanentlyClosed: 0 }, {}),
    ).toBeNull();
  });

  it("uses singular and plural forms", () => {
    expect(
      describeExclusions({ belowMinRating: 0, closedNow: 0, permanentlyClosed: 1 }, {}),
    ).toBe("Hidden by your filters: 1 cafe permanently closed.");
  });
});
