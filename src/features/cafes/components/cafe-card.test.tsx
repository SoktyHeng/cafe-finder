import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

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
    render(<CafeCard recommendation={recommend(FULL_GOOGLE_CAFE)} rank={2} />);

    const card = screen.getByRole("article", { name: "Test Cafe" });
    expect(card).toHaveTextContent("4.7 Google rating from 900 reviews");
    expect(card).toHaveTextContent("300 m away (straight line)");
    expect(card).toHaveTextContent("Open now (according to Google)");
    expect(card).toHaveTextContent("Price level: Moderate");
    expect(within(card).queryByText("Demo data")).not.toBeInTheDocument();
  });

  it("shows a match percentage with confidence and evidence-backed reasons", () => {
    render(<CafeCard recommendation={recommend(FULL_GOOGLE_CAFE)} rank={1} />);

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
    render(<CafeCard recommendation={recommend(testCafe({ placeId: "p2" }))} rank={1} />);

    const badge = screen.getByTestId("match-badge");
    expect(badge).toHaveTextContent("Limited data");
    expect(badge).not.toHaveTextContent("%");
    expect(screen.queryByText("Best match")).not.toBeInTheDocument();
  });

  it("labels unknown data as unknown instead of inventing values", () => {
    render(<CafeCard recommendation={recommend(testCafe({ placeId: "p2" }))} rank={3} />);

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
        rank={1}
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
    render(<CafeCard recommendation={recommend(FULL_GOOGLE_CAFE)} rank={1} />);
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
        rank={1}
      />,
    );
    expect(screen.getByText("Temporarily closed")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Things to know" })).toHaveTextContent(
      "Listed as temporarily closed (according to Google)",
    );
  });

  it("links to the place on Google Maps in a new tab", () => {
    render(
      <CafeCard
        recommendation={recommend(
          testCafe({ placeId: "p5", name: "Linked", googleMapsUri: "https://maps.google.com/?cid=1", dataSource: "google" }),
        )}
        rank={1}
      />,
    );
    const link = screen.getByRole("link", { name: /open in google maps: linked/i });
    expect(link).toHaveAttribute("href", "https://maps.google.com/?cid=1");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("has no Google Maps link without a URI", () => {
    render(<CafeCard recommendation={recommend(testCafe({ placeId: "p6" }))} rank={1} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
