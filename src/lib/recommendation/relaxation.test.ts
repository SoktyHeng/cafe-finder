import { describe, expect, it } from "vitest";

import { suggestRelaxations } from "./relaxation";

const NONE = { belowMinRating: 0, closedNow: 0, permanentlyClosed: 0 };

describe("suggestRelaxations", () => {
  it("offers to drop filters that actually excluded cafes, with counts", () => {
    expect(
      suggestRelaxations(
        { minRating: 4.5, openNowOnly: true, radiusMeters: 3000 },
        { belowMinRating: 3, closedNow: 1, permanentlyClosed: 2 },
        15_000,
      ),
    ).toEqual([
      { change: { kind: "removeMinRating" }, label: "Include 3 cafes rated below 4.5", knownExtraResults: 3 },
      { change: { kind: "includeClosed" }, label: "Include 1 cafe closed right now", knownExtraResults: 1 },
      { change: { kind: "widenRadius", radiusMeters: 5000 }, label: "Search within 5 km" },
    ]);
  });

  it("does not suggest removing filters that excluded nothing", () => {
    expect(
      suggestRelaxations({ minRating: 4.5, openNowOnly: true, radiusMeters: 3000 }, NONE, 15_000).map(
        (suggestion) => suggestion.change.kind,
      ),
    ).toEqual(["widenRadius"]);
  });

  it.each([
    [1000, 3000],
    [3000, 5000],
    [4000, 5000],
    [5000, 10_000],
    [10_000, 15_000],
  ])("widens %d m to the next step %d m", (radiusMeters, next) => {
    expect(suggestRelaxations({ radiusMeters }, NONE, 15_000)).toEqual([
      { change: { kind: "widenRadius", radiusMeters: next }, label: `Search within ${next / 1000} km` },
    ]);
  });

  it("respects the configured maximum radius", () => {
    expect(suggestRelaxations({ radiusMeters: 15_000 }, NONE, 15_000)).toEqual([]);
    expect(suggestRelaxations({ radiusMeters: 5000 }, NONE, 8000)).toEqual([]);
  });
});
