"use client";

import { Check, LocateFixed, MapPin, Search } from "lucide-react";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { DEFAULT_CITY, searchAreas } from "@/lib/locations/cities";
import { cn } from "@/lib/utils";

import { areaLocation, deviceLocation, type LocationChoice } from "../form-state";
import { useGeolocation, type GeolocationStatus } from "../hooks/use-geolocation";

/** Beyond this, a device position is too coarse to call "nearby". */
const LOW_ACCURACY_METERS = 2_000;

const GEOLOCATION_MESSAGES: Partial<Record<GeolocationStatus, string>> = {
  requesting: "Asking your browser for your location…",
  denied:
    "Location access was blocked. Choose an area below instead. You can re-enable location in your browser settings.",
  unavailable: "Your location could not be determined. Choose an area below instead.",
  timeout: "Finding your location took too long. Try again or choose an area below.",
  unsupported: "This browser cannot share your location. Choose an area below instead.",
};

type LocationPickerProps = {
  value: LocationChoice | null;
  onChange: (location: LocationChoice) => void;
  /** Shown when the form is submitted without a location. */
  error?: string;
  searchInputId?: string;
};

export function LocationPicker({
  value,
  onChange,
  error,
  searchInputId,
}: LocationPickerProps) {
  const generatedId = useId();
  const inputId = searchInputId ?? `${generatedId}-area-search`;
  const hintId = `${generatedId}-consent`;
  const errorId = `${generatedId}-error`;
  const resultsId = `${generatedId}-areas`;
  const [query, setQuery] = useState("");
  const geolocation = useGeolocation();

  const matches = searchAreas(DEFAULT_CITY, query);
  const geoMessage = GEOLOCATION_MESSAGES[geolocation.status];
  const isLowAccuracy =
    value?.kind === "device" &&
    value.accuracyMeters !== undefined &&
    value.accuracyMeters > LOW_ACCURACY_METERS;

  return (
    <fieldset
      className="flex min-w-0 flex-col gap-3"
      aria-describedby={error ? errorId : undefined}
    >
      <legend className="mb-1 text-base font-medium">Where are you?</legend>

      <div className="flex flex-col gap-2">
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="min-h-11 w-full justify-start px-3"
          aria-describedby={hintId}
          disabled={geolocation.status === "requesting"}
          onClick={() =>
            geolocation.request((position) => onChange(deviceLocation(position)))
          }
        >
          <LocateFixed aria-hidden="true" />
          Use my current location
        </Button>
        <p id={hintId} className="text-xs text-muted-foreground">
          Your browser will ask first. We use your position only for this search,
          rounded to about 100 m, and we don&apos;t store it.
        </p>
        <p role="status" className="text-sm empty:hidden">
          {geoMessage}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor={inputId} className="text-sm font-medium">
          Or search for an area in {DEFAULT_CITY.name}
        </label>
        <div className="relative">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <input
            id={inputId}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              // Enter picks the first match instead of submitting the form.
              if (event.key === "Enter") {
                event.preventDefault();
                const [firstMatch] = matches;
                if (firstMatch) {
                  onChange(areaLocation(firstMatch));
                }
              }
            }}
            aria-describedby={`${resultsId}-hint`}
            placeholder="e.g. BKK1, Riverside, Russian Market"
            autoComplete="off"
            aria-controls={resultsId}
            aria-invalid={error ? true : undefined}
            className="h-11 w-full rounded-lg border border-input bg-background pr-3 pl-9 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive"
          />
        </div>
        <ul
          id={resultsId}
          aria-label="Matching areas"
          className="flex max-h-56 flex-col gap-1 overflow-y-auto rounded-lg border p-1"
        >
          {matches.map((area) => {
            const selected = value?.kind === "area" && value.areaId === area.id;
            return (
              <li key={area.id}>
                <button
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onChange(areaLocation(area))}
                  className={cn(
                    "flex min-h-11 w-full items-center gap-2 rounded-md px-3 text-left text-sm outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
                    selected && "bg-secondary font-medium",
                  )}
                >
                  {selected ? (
                    <Check aria-hidden="true" className="size-4 shrink-0 text-primary" />
                  ) : (
                    <MapPin aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                  )}
                  {area.name}
                </button>
              </li>
            );
          })}
          {matches.length === 0 && (
            <li className="px-3 py-2 text-sm text-muted-foreground">
              No areas match “{query}”.
            </li>
          )}
        </ul>
        <p id={`${resultsId}-hint`} className="text-xs text-muted-foreground">
          Press Enter to pick the first match. Areas use an approximate centre point.
        </p>
      </div>

      {error && (
        <p id={errorId} className="text-sm font-medium text-destructive">
          {error}
        </p>
      )}

      {value && (
        <p className="rounded-md bg-secondary px-3 py-2 text-sm" data-testid="selected-location">
          Searching near <span className="font-medium">{value.label}</span>
          {isLowAccuracy && (
            <span className="block text-xs text-muted-foreground">
              Your browser reported an approximate position. Choose an area if
              results look far away.
            </span>
          )}
        </p>
      )}
    </fieldset>
  );
}
