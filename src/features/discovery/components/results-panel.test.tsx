import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { DiscoveryRequest } from "@/lib/discovery/request-schema";
import type { NearbySearchResponse } from "@/lib/places/schemas";

import type { NearbySearchState } from "../hooks/use-nearby-search";
import { ResultsPanel, describeExclusions } from "./results-panel";

const REQUEST: DiscoveryRequest = {
  latitude: 11.553,
  longitude: 104.925,
  radiusMeters: 3000,
  purpose: "work",
  minRating: 4.5,
  preferWifi: true,
};

const response = (overrides: Partial<NearbySearchResponse> = {}): NearbySearchResponse => ({
  results: [
    { placeId: "fixture-001", name: "First", distanceMeters: 200, dataSource: "fixture" },
    { placeId: "fixture-002", name: "Second", distanceMeters: 900, dataSource: "fixture" },
  ],
  searchedAt: "2026-10-16T00:00:00.000Z",
  source: "fixture",
  coverageNote: "Results are a subset of nearby cafes, not an exhaustive list.",
  excluded: { belowMinRating: 0, closedNow: 0, permanentlyClosed: 0 },
  attributions: [],
  ...overrides,
});

function renderPanel(state: NearbySearchState) {
  const onRetry = vi.fn();
  const onEditSearch = vi.fn();
  render(
    <ResultsPanel
      state={state}
      request={REQUEST}
      locationLabel="BKK1"
      onRetry={onRetry}
      onEditSearch={onEditSearch}
    />,
  );
  return { onRetry, onEditSearch, user: userEvent.setup() };
}

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

  it("lists results in order with context and announces the count", () => {
    renderPanel({ status: "done", outcome: { ok: true, data: response() } });

    expect(screen.getByRole("heading", { name: "2 cafes within 3 km of BKK1" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("2 cafes found.");
    expect(screen.getByText(/not an exhaustive list/)).toBeInTheDocument();
    expect(screen.getByTestId("demo-results-notice")).toBeInTheDocument();

    const list = screen.getByRole("list", { name: "Cafes" });
    const names = within(list)
      .getAllByRole("article")
      .map((article) => article.getAttribute("aria-labelledby"))
      .map((id) => document.getElementById(id ?? "")?.textContent);
    expect(names).toEqual(["First", "Second"]);
    expect(within(list).getAllByText("Wi-Fi")).toHaveLength(2);
  });

  it("shows Google Maps attribution and an hours caveat for Google results", () => {
    renderPanel({
      status: "done",
      outcome: {
        ok: true,
        data: response({
          source: "google",
          results: [{ placeId: "ChIJa", name: "Real", dataSource: "google" }],
          attributions: [{ provider: "Data Co" }],
        }),
      },
    });
    expect(screen.getByTestId("google-maps-attribution")).toHaveTextContent("Google Maps · Data: Data Co");
    expect(screen.getByText(/hours can change/i)).toBeInTheDocument();
    expect(screen.queryByTestId("demo-results-notice")).not.toBeInTheDocument();
  });

  it("does not show Google attribution for demo data", () => {
    renderPanel({ status: "done", outcome: { ok: true, data: response() } });
    expect(screen.queryByTestId("google-maps-attribution")).not.toBeInTheDocument();
  });

  it("explains an empty result and offers to edit the search", async () => {
    const { onEditSearch, user } = renderPanel({
      status: "done",
      outcome: {
        ok: true,
        data: response({
          results: [],
          excluded: { belowMinRating: 2, closedNow: 1, permanentlyClosed: 0 },
        }),
      },
    });

    expect(
      screen.getByRole("heading", { name: "No cafes found within 3 km of BKK1" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Hidden by your filters: 2 cafes rated below 4.5, 1 cafe closed now."),
    ).toBeInTheDocument();
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
