"use client";

import { useSyncExternalStore } from "react";

import { cn } from "@/lib/utils";

import { todayIndex } from "../opening-hours";

const subscribeNever = () => () => {};

/** Weekly hours as given by the source; today's line (in the cafe's timezone) is highlighted. */
export function OpeningHoursList({
  weekdayDescriptions,
  utcOffsetMinutes,
  sourceName,
}: {
  weekdayDescriptions: readonly string[] | undefined;
  utcOffsetMinutes: number | undefined;
  sourceName: string;
}) {
  // "Today" depends on the clock, so it's computed on the client only (no hydration mismatch).
  const today = useSyncExternalStore(
    subscribeNever,
    () => (weekdayDescriptions ? todayIndex(weekdayDescriptions, utcOffsetMinutes, new Date()) : -1),
    () => -1,
  );

  if (!weekdayDescriptions || weekdayDescriptions.length === 0) {
    return <p className="text-sm text-muted-foreground">Opening hours unknown.</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-1 text-sm" aria-label="Opening hours">
        {weekdayDescriptions.map((line, index) => (
          <li
            key={line}
            aria-current={index === today ? "date" : undefined}
            className={cn("rounded px-2 py-1", index === today && "bg-secondary font-medium")}
          >
            {line}
            {index === today && <span className="ml-2 text-xs text-muted-foreground">(today)</span>}
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        Hours from {sourceName}, in the cafe&apos;s local time. They can change, so confirm with the cafe.
      </p>
    </div>
  );
}
