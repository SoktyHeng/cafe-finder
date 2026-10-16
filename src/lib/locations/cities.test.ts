import { describe, expect, it } from "vitest";

import { CITIES, PHNOM_PENH, findAreaById, searchAreas } from "./cities";

describe("city areas", () => {
  it("have unique IDs across all cities", () => {
    const ids = CITIES.flatMap((city) => city.areas.map((area) => area.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("have valid coordinates inside the Phnom Penh area", () => {
    for (const area of PHNOM_PENH.areas) {
      expect(area.latitude).toBeGreaterThan(11.4);
      expect(area.latitude).toBeLessThan(11.7);
      expect(area.longitude).toBeGreaterThan(104.8);
      expect(area.longitude).toBeLessThan(105.0);
    }
  });

  it("include the city's default area", () => {
    expect(findAreaById(PHNOM_PENH.defaultAreaId)).toBeDefined();
  });
});

describe("searchAreas", () => {
  it("returns every area for an empty or blank query", () => {
    expect(searchAreas(PHNOM_PENH, "")).toHaveLength(PHNOM_PENH.areas.length);
    expect(searchAreas(PHNOM_PENH, "   ")).toHaveLength(PHNOM_PENH.areas.length);
  });

  it("matches names case-insensitively", () => {
    expect(searchAreas(PHNOM_PENH, "RIVERSIDE").map((area) => area.id)).toEqual([
      "riverside",
    ]);
  });

  it("matches aliases such as landmark names", () => {
    expect(searchAreas(PHNOM_PENH, "russian market").map((area) => area.id)).toEqual([
      "tuol-tom-poung",
    ]);
    expect(searchAreas(PHNOM_PENH, "bkk").map((area) => area.id)).toContain("bkk1");
  });

  it("returns nothing for an unknown place", () => {
    expect(searchAreas(PHNOM_PENH, "atlantis")).toEqual([]);
  });
});

describe("findAreaById", () => {
  it("returns undefined for unknown IDs", () => {
    expect(findAreaById("nowhere")).toBeUndefined();
  });
});
