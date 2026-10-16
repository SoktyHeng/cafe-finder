import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CafeCard } from "./cafe-card";

describe("CafeCard", () => {
  it("shows known facts with their source", () => {
    render(
      <CafeCard
        cafe={{
          placeId: "p1",
          name: "Test Cafe",
          address: "1 Test St",
          rating: 4.6,
          ratingCount: 412,
          priceLevel: "moderate",
          openNow: true,
          distanceMeters: 1234,
          dataSource: "google",
        }}
        unverifiedPreferences={[]}
      />,
    );

    const card = screen.getByRole("article", { name: "Test Cafe" });
    expect(card).toHaveTextContent("4.6 Google rating from 412 reviews");
    expect(card).toHaveTextContent("1.2 km away (straight line)");
    expect(card).toHaveTextContent("Open now (according to Google)");
    expect(card).toHaveTextContent("Price level: Moderate");
    expect(within(card).queryByText("Demo data")).not.toBeInTheDocument();
  });

  it("labels unknown data as unknown instead of inventing values", () => {
    render(
      <CafeCard cafe={{ placeId: "p2", dataSource: "fixture" }} unverifiedPreferences={[]} />,
    );

    const card = screen.getByRole("article", { name: "Unnamed cafe" });
    expect(card).toHaveTextContent("No rating yet");
    expect(card).toHaveTextContent("Distance unknown");
    expect(card).toHaveTextContent("Opening hours unknown");
    expect(card).not.toHaveTextContent(/closed/i);
    expect(card).not.toHaveTextContent(/price level/i);
  });

  it("marks fixture cafes as demo data", () => {
    render(
      <CafeCard
        cafe={{ placeId: "fixture-1", name: "Demo", dataSource: "fixture" }}
        unverifiedPreferences={[]}
      />,
    );
    expect(screen.getByText("Demo data")).toBeInTheDocument();
  });

  it("flags temporary closures", () => {
    render(
      <CafeCard
        cafe={{ placeId: "p3", name: "Shut", businessStatus: "closed_temporarily", dataSource: "google" }}
        unverifiedPreferences={[]}
      />,
    );
    expect(screen.getByText("Temporarily closed")).toBeInTheDocument();
  });

  it("lists preferences that could not be verified", () => {
    render(
      <CafeCard
        cafe={{ placeId: "p4", name: "Prefs", dataSource: "google" }}
        unverifiedPreferences={["Wi-Fi", "Quiet"]}
      />,
    );
    const list = screen.getByRole("list", { name: "Preferences not verified" });
    expect(within(list).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "Wi-Fi",
      "Quiet",
    ]);
  });
});
