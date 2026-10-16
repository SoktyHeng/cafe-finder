"use client";

import { useId } from "react";

import { formatRadius } from "@/features/cafes/format";
import { RADIUS_METERS } from "@/lib/discovery/request-schema";

import { MIN_RATING_OPTIONS } from "@/lib/discovery/options";

type FilterControlsProps = {
  radiusMeters: number;
  maxRadiusMeters: number;
  minRating: number | undefined;
  openNowOnly: boolean;
  onRadiusChange: (meters: number) => void;
  onMinRatingChange: (rating: number | undefined) => void;
  onOpenNowChange: (openNowOnly: boolean) => void;
};

const ANY_RATING = "any";

export function FilterControls({
  radiusMeters,
  maxRadiusMeters,
  minRating,
  openNowOnly,
  onRadiusChange,
  onMinRatingChange,
  onOpenNowChange,
}: FilterControlsProps) {
  const id = useId();
  const radiusId = `${id}-radius`;
  const ratingId = `${id}-rating`;
  const openId = `${id}-open`;

  return (
    <fieldset className="flex min-w-0 flex-col gap-4">
      <legend className="mb-1 text-base font-medium">Filters</legend>

      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <label htmlFor={radiusId} className="text-sm font-medium">
            Distance
          </label>
          <output htmlFor={radiusId} className="text-sm tabular-nums">
            Within {formatRadius(radiusMeters)}
          </output>
        </div>
        <input
          id={radiusId}
          type="range"
          min={RADIUS_METERS.min}
          max={maxRadiusMeters}
          step={RADIUS_METERS.step}
          value={radiusMeters}
          aria-valuetext={`Within ${formatRadius(radiusMeters)}`}
          onChange={(event) => onRadiusChange(Number(event.target.value))}
          className="h-11 w-full cursor-pointer accent-primary"
        />
        <p className="text-xs text-muted-foreground">
          Straight-line distance, not travel distance.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor={ratingId} className="text-sm font-medium">
          Minimum rating
        </label>
        <select
          id={ratingId}
          value={minRating === undefined ? ANY_RATING : String(minRating)}
          onChange={(event) =>
            onMinRatingChange(
              event.target.value === ANY_RATING ? undefined : Number(event.target.value),
            )
          }
          className="h-11 w-full rounded-lg border border-input bg-background px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {MIN_RATING_OPTIONS.map((option) => (
            <option
              key={option.label}
              value={option.value === undefined ? ANY_RATING : String(option.value)}
            >
              {option.label}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          Cafes with no rating yet are kept and labelled.
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex min-h-11 items-center gap-3">
          <input
            id={openId}
            type="checkbox"
            checked={openNowOnly}
            onChange={(event) => onOpenNowChange(event.target.checked)}
            className="size-5 cursor-pointer accent-primary"
          />
          <label htmlFor={openId} className="cursor-pointer text-sm font-medium">
            Open now only
          </label>
        </div>
        <p className="text-xs text-muted-foreground">
          Cafes with unknown opening hours are kept and labelled.
        </p>
      </div>
    </fieldset>
  );
}
