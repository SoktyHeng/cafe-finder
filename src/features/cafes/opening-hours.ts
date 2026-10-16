const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

/**
 * The weekday at the cafe right now, using its UTC offset (not the viewer's
 * timezone). `undefined` when the offset is unknown.
 */
export function placeWeekday(utcOffsetMinutes: number | undefined, now: Date): string | undefined {
  if (utcOffsetMinutes === undefined) return undefined;
  const placeTime = new Date(now.getTime() + utcOffsetMinutes * 60_000);
  return WEEKDAYS[placeTime.getUTCDay()];
}

/**
 * Index of today's line in Google's `weekdayDescriptions`. The order depends
 * on locale, so lines are matched by weekday name ("Monday: 7:00 AM – …"),
 * never by position. `-1` if today can't be determined safely.
 */
export function todayIndex(
  weekdayDescriptions: readonly string[],
  utcOffsetMinutes: number | undefined,
  now: Date,
): number {
  const today = placeWeekday(utcOffsetMinutes, now);
  if (!today) return -1;
  return weekdayDescriptions.findIndex((line) => line.startsWith(`${today}:`));
}
