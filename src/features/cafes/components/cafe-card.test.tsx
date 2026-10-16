import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { recommend, testCafe } from "@/test/recommendations";

import { CafeCard } from "./cafe-card";

const FULL_GOOGLE_CAFE = testCafe({
  placeId: "p1",
  name: "Test Cafe",
  address: "1 Test St",
  rating: 4.7,
  ratingCount: 900,
  priceLevel: "moderate",
  openNow: true,
  distanceMeters: 300,
  dataSource: "google",
});

describe("CafeCard", () => {
  it("shows known facts with their source", () => {
    render(<CafeCard recommendation={recommend(FULL_GOOGLE_CAFE)} detailsHref="/cafes/x" rank={2} />);

    const card = screen.getByRole("article", { name: "Test Cafe" });
    expect(card).toHaveTextContent("4.7 Google rating from 900 reviews");
    expect(card).toHaveTextContent("300 m away (straight line)");
    expect(card).toHaveTextContent("Open now (according to Google)");
    expect(card).toHaveTextContent("Price level: Moderate");
    expect(within(card).queryByText("Demo data")).not.toBeInTheDocument();
  });

  it("shows a match percentage with confidence and evidence-backed reasons", () => {
    render(<CafeCard recommendation={recommend(FULL_GOOGLE_CAFE)} detailsHref="/cafes/x" rank={1} />);

    const badge = screen.getByTestId("match-badge");
    expect(badge).toHaveTextContent(/^\d{1,3}% match/);
    expect(badge).toHaveTextContent("High confidence");
    expect(screen.getByText("Best match")).toBeInTheDocument();

    const reasons = screen.getByRole("list", { name: "Why it matches" });
    expect(within(reasons).getByText("Highly rated by many Google reviewers")).toBeInTheDocument();
    expect(within(reasons).getByText("Very close to you")).toBeInTheDocument();
    expect(within(reasons).getByText("Open now (according to Google)")).toBeInTheDocument();
  });

  it("shows 'Limited data' instead of a percentage when evidence is thin", () => {
    render(<CafeCard recommendation={recommend(testCafe({ placeId: "p2" }))} detailsHref="/cafes/x" rank={1} />);

    const badge = screen.getByTestId("match-badge");
    expect(badge).toHaveTextContent("Limited data");
    expect(badge).not.toHaveTextContent("%");
    expect(screen.queryByText("Best match")).not.toBeInTheDocument();
  });

  it("labels unknown data as unknown instead of inventing values", () => {
    render(<CafeCard recommendation={recommend(testCafe({ placeId: "p2" }))} detailsHref="/cafes/x" rank={3} />);

    const card = screen.getByRole("article", { name: "Unnamed cafe" });
    expect(card).toHaveTextContent("No rating yet");
    expect(card).toHaveTextContent("Distance unknown");
    expect(card).toHaveTextContent("Opening hours unknown");
    expect(card).not.toHaveTextContent(/closed now/i);
    expect(card).not.toHaveTextContent(/price level/i);
    expect(screen.queryByRole("list", { name: "Why it matches" })).not.toBeInTheDocument();
  });

  it("lists preferences that could not be verified", () => {
    render(
      <CafeCard
        recommendation={recommend(testCafe({ placeId: "p4", name: "Prefs" }), {
          preferWifi: true,
          preferQuiet: true,
        })}
        detailsHref="/cafes/x" rank={1}
      />,
    );
    const list = screen.getByRole("list", { name: "Preferences not verified" });
    expect(within(list).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "Good for work or study",
      "Wi-Fi",
      "Quiet",
    ]);
  });

  it("explains the score breakdown on request", async () => {
    render(<CafeCard recommendation={recommend(FULL_GOOGLE_CAFE)} detailsHref="/cafes/x" rank={1} />);
    await userEvent.click(screen.getByText("How this match is calculated"));

    const table = screen.getByRole("table", { name: "Score breakdown" });
    expect(within(table).getByRole("rowheader", { name: "Rating" })).toBeInTheDocument();
    expect(within(table).getByText("Unknown (neutral)")).toBeInTheDocument();
    expect(screen.getByText(/Based on 3 of 4 factors with data/)).toBeInTheDocument();
  });

  it("flags temporary closures as a badge and a caution", () => {
    render(
      <CafeCard
        recommendation={recommend(
          testCafe({ placeId: "p3", name: "Shut", businessStatus: "closed_temporarily", openNow: true, dataSource: "google" }),
        )}
        detailsHref="/cafes/x" rank={1}
      />,
    );
    expect(screen.getByText("Temporarily closed")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Things to know" })).toHaveTextContent(
      "Listed as temporarily closed (according to Google)",
    );
  });

  it("links to details and to Google Maps directions", () => {
    render(<CafeCard recommendation={recommend(FULL_GOOGLE_CAFE)} detailsHref="/cafes/p1?from=area%3Dbkk1" rank={1} />);

    expect(screen.getByRole("link", { name: /details: test cafe/i })).toHaveAttribute(
      "href",
      "/cafes/p1?from=area%3Dbkk1",
    );
    const directions = screen.getByRole("link", { name: /directions: test cafe/i });
    expect(directions).toHaveAttribute(
      "href",
      "https://www.google.com/maps/dir/?api=1&destination=Test+Cafe&destination_place_id=p1",
    );
    expect(directions).toHaveAttribute("target", "_blank");
    expect(directions).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("offers no directions for demo cafes", () => {
    render(<CafeCard recommendation={recommend(testCafe({ placeId: "fixture-1", name: "Demo" }))} detailsHref="/cafes/x" rank={1} />);
    expect(screen.queryByRole("link", { name: /directions/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /details/i })).toBeInTheDocument();
  });

  it("shows on the map when asked and reflects selection", async () => {
    const onShowOnMap = vi.fn();
    const { rerender } = render(
      <CafeCard recommendation={recommend(FULL_GOOGLE_CAFE)} detailsHref="/cafes/x" rank={1} onShowOnMap={onShowOnMap} />,
    );
    const button = screen.getByRole("button", { name: /show on map: test cafe/i });
    expect(button).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(button);
    expect(onShowOnMap).toHaveBeenCalledOnce();

    rerender(
      <CafeCard recommendation={recommend(FULL_GOOGLE_CAFE)} detailsHref="/cafes/x" rank={1} onShowOnMap={onShowOnMap} selected />,
    );
    expect(screen.getByRole("button", { name: /show on map/i })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Selected on map")).toBeInTheDocument();
    expect(screen.getByRole("article")).toHaveAttribute("data-selected", "true");
  });

  it("has no map button without a map position, and a compact variant without explanation", () => {
    render(
      <CafeCard recommendation={recommend(FULL_GOOGLE_CAFE)} detailsHref="/cafes/x" rank={1} compact />,
    );
    expect(screen.queryByRole("button", { name: /show on map/i })).not.toBeInTheDocument();
    expect(screen.queryByText("How this match is calculated")).not.toBeInTheDocument();
    expect(screen.getByRole("article")).not.toHaveAttribute("id");
  });
});
