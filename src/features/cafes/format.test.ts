import { describe, expect, it } from "vitest";

import { formatDistance, openStatus, priceLevelText, ratingText } from "./format";

describe("formatDistance", () => {
  it.each([
    [0, "0 m"],
    [44, "40 m"],
    [850, "850 m"],
    [994, "990 m"],
    [996, "1.0 km"],
    [1234, "1.2 km"],
    [14_960, "15.0 km"],
  ])("%d m -> %s", (meters, expected) => {
    expect(formatDistance(meters)).toBe(expected);
  });
});

describe("ratingText", () => {
  it("labels the source and review count", () => {
    expect(ratingText({ rating: 4.6, ratingCount: 1280, dataSource: "google" })).toBe(
      "4.6 Google rating from 1,280 reviews",
    );
    expect(ratingText({ rating: 4, ratingCount: 1, dataSource: "fixture" })).toBe(
      "4.0 Demo rating from 1 review",
    );
  });

  it("omits the count when unknown and says when there is no rating", () => {
    expect(ratingText({ rating: 3.5, dataSource: "google" })).toBe("3.5 Google rating");
    expect(ratingText({ dataSource: "google" })).toBe("No rating yet");
  });
});

describe("openStatus", () => {
  it("never reports unknown hours as closed", () => {
    expect(openStatus({ dataSource: "google" })).toEqual({
      label: "Opening hours unknown",
      tone: "unknown",
    });
  });

  it("attributes known status to its source", () => {
    expect(openStatus({ openNow: true, dataSource: "google" }).label).toBe(
      "Open now (according to Google)",
    );
    expect(openStatus({ openNow: false, dataSource: "fixture" }).label).toBe(
      "Closed now (according to demo data)",
    );
  });
});

describe("priceLevelText", () => {
  it("describes a qualitative level", () => {
    expect(priceLevelText("very_expensive")).toBe("Price level: Very expensive");
  });
});
