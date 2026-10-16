import { describe, expect, it } from "vitest";

import { placeWeekday, todayIndex } from "./opening-hours";

describe("opening hours", () => {
  // 2026-10-16T20:00Z is Friday in UTC but Saturday 03:00 in Phnom Penh (UTC+7).
  const now = new Date("2026-10-16T20:00:00Z");
  const week = [
    "Monday: 7:00 AM – 9:00 PM",
    "Tuesday: 7:00 AM – 9:00 PM",
    "Wednesday: 7:00 AM – 9:00 PM",
    "Thursday: 7:00 AM – 9:00 PM",
    "Friday: 7:00 AM – 9:00 PM",
    "Saturday: 8:00 AM – 10:00 PM",
    "Sunday: Closed",
  ];

  it("uses the cafe's timezone, not the viewer's", () => {
    expect(placeWeekday(420, now)).toBe("Saturday");
    expect(placeWeekday(0, now)).toBe("Friday");
    expect(todayIndex(week, 420, now)).toBe(5);
  });

  it("matches by name when the week starts on another day", () => {
    const sundayFirst = [week[6] ?? "", ...week.slice(0, 6)];
    expect(todayIndex(sundayFirst, 420, now)).toBe(6);
  });

  it("returns -1 when the offset or day is unknown", () => {
    expect(todayIndex(week, undefined, now)).toBe(-1);
    expect(todayIndex(["Lundi: 7h–21h"], 420, now)).toBe(-1);
  });
});
