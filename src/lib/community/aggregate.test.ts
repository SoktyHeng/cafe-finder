import { describe, expect, it } from "vitest";

import { COMMUNITY_TRUST, aggregateReports, describeSummary, reportWeight, toCafeEvidence } from "./aggregate";
import type { AmenitySummary, CommunityReport } from "./schemas";

const NOW = new Date("2026-10-19T12:00:00Z");
const report = (overrides: Partial<CommunityReport> = {}): CommunityReport => ({
  placeId: "ChIJa",
  amenity: "wifi",
  value: "yes",
  observedOn: "2026-10-19",
  confirmedVisit: false,
  ...overrides,
});
const summaryFor = (reports: CommunityReport[], amenity = "wifi") =>
  aggregateReports(reports, NOW).get("ChIJa")?.find((summary) => summary.amenity === amenity);

describe("reportWeight", () => {
  it("counts confirmed visits fully and others half", () => {
    expect(reportWeight({ confirmedVisit: true, observedOn: "2026-10-19" }, NOW)).toBeCloseTo(1, 2);
    expect(reportWeight({ confirmedVisit: false, observedOn: "2026-10-19" }, NOW)).toBeCloseTo(0.5, 2);
  });

  it("halves every 180 days and never grows for future dates", () => {
    expect(reportWeight({ confirmedVisit: true, observedOn: "2026-04-22" }, NOW)).toBeCloseTo(0.5, 2);
    expect(reportWeight({ confirmedVisit: true, observedOn: "2026-10-20" }, NOW)).toBe(1);
  });
});

describe("aggregateReports", () => {
  it("returns consensus, agreement, counts and latest date", () => {
    const summary = summaryFor([
      report({ value: "yes", confirmedVisit: true }),
      report({ value: "yes", observedOn: "2026-09-01" }),
      report({ value: "no", observedOn: "2026-08-01" }),
    ]);
    expect(summary).toMatchObject({
      amenity: "wifi",
      consensus: "yes",
      reportCount: 3,
      confirmedVisitCount: 1,
      latestObservedOn: "2026-10-19",
      conflicted: false,
      sufficient: true,
    });
    expect(summary?.agreement).toBeGreaterThan(0.75);
    expect(summary?.score).toBeCloseTo(summary?.agreement ?? 0, 4); // yes=1, no=0
  });

  it("marks evenly split reports as conflicted", () => {
    const summary = summaryFor([report({ value: "yes" }), report({ value: "no" })]);
    expect(summary).toMatchObject({ conflicted: true, agreement: 0.5, score: 0.5 });
  });

  it("requires enough weight before evidence is sufficient", () => {
    expect(summaryFor([report()])?.sufficient).toBe(false); // one unconfirmed: 0.5
    expect(summaryFor([report(), report()])?.sufficient).toBe(true); // 1.0
    expect(summaryFor([report({ confirmedVisit: true })])?.sufficient).toBe(true);
    expect(summaryFor([report({ confirmedVisit: true, observedOn: "2026-01-01" })])?.sufficient).toBe(false); // decayed
  });

  it("scores graded values", () => {
    const noise = summaryFor([report({ amenity: "noise", value: "moderate", confirmedVisit: true })], "noise");
    expect(noise).toMatchObject({ consensus: "moderate", score: 0.5, conflicted: false });
  });

  it("ignores invalid values and dates, and separates places and amenities", () => {
    const result = aggregateReports(
      [
        report({ value: "fast" }),
        report({ observedOn: "not-a-date" }),
        report({ placeId: "ChIJb", amenity: "outlets", value: "many" }),
        report({ amenity: "seating", value: "comfortable" }),
      ],
      NOW,
    );
    expect(result.get("ChIJa")?.map((summary) => summary.amenity)).toEqual(["seating"]);
    expect(result.get("ChIJb")?.map((summary) => summary.amenity)).toEqual(["outlets"]);
  });

  it("breaks exact ties deterministically by the option order", () => {
    const tie = summaryFor([report({ value: "no" }), report({ value: "yes" })]);
    expect(tie?.consensus).toBe("yes");
  });

  it("returns nothing for no reports", () => {
    expect(aggregateReports([], NOW).size).toBe(0);
  });
});

describe("describeSummary", () => {
  it("summarises provenance", () => {
    const summary = summaryFor([report({ confirmedVisit: true }), report({ observedOn: "2026-09-01" })]) as AmenitySummary;
    expect(describeSummary(summary)).toBe("2 reports, 1 confirmed visit, latest Oct 2026");
  });
});

describe("toCafeEvidence", () => {
  const sufficient = (amenity: AmenitySummary["amenity"], score: number): AmenitySummary => ({
    amenity,
    consensus: "x",
    agreement: 1,
    score,
    reportCount: 2,
    confirmedVisitCount: 0,
    latestObservedOn: "2026-10-01",
    conflicted: false,
    sufficient: true,
  });

  it("ignores insufficient evidence entirely", () => {
    expect(toCafeEvidence([{ ...sufficient("wifi", 1), sufficient: false }])).toBeUndefined();
  });

  it("maps Wi-Fi and noise directly, and derives only work and relax fit", () => {
    const evidence = toCafeEvidence([
      sufficient("wifi", 1),
      sufficient("outlets", 0.6),
      sufficient("laptop_friendly", 1),
      sufficient("noise", 0),
      sufficient("seating", 1),
    ]);
    expect(evidence?.sourceLabel).toBe("Cafe Finder members");
    expect(evidence?.wifi?.score).toBe(1);
    expect(evidence?.quiet?.score).toBe(0);
    expect(evidence?.purposeFit?.work?.score).toBeCloseTo((1 + 0.6 + 1) / 3, 3);
    expect(evidence?.purposeFit?.relax?.score).toBeCloseTo(0.5, 3);
    expect(evidence?.purposeFit?.friends).toBeUndefined();
    expect(evidence?.purposeFit?.date).toBeUndefined();
    expect(evidence?.purposeFit?.work?.detail).toBe("6 member reports on laptop-friendly, power outlets, wi-fi");
  });

  it("uses the documented trust constants", () => {
    expect(COMMUNITY_TRUST).toEqual({
      confirmedVisitWeight: 1,
      unconfirmedWeight: 0.5,
      halfLifeDays: 180,
      minEvidenceWeight: 1,
      consensusThreshold: 0.6,
    });
  });
});
