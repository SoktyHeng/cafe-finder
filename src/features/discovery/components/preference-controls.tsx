"use client";

import { ChevronDown, Info } from "lucide-react";
import { useId, useState } from "react";

import type { Budget } from "@/lib/discovery/request-schema";

import { BUDGET_OPTIONS } from "@/lib/discovery/options";

type PreferenceControlsProps = {
  budget: Budget;
  preferQuiet: boolean;
  preferWifi: boolean;
  onBudgetChange: (budget: Budget) => void;
  onQuietChange: (preferQuiet: boolean) => void;
  onWifiChange: (preferWifi: boolean) => void;
};

export function PreferenceControls({
  budget,
  preferQuiet,
  preferWifi,
  onBudgetChange,
  onQuietChange,
  onWifiChange,
}: PreferenceControlsProps) {
  const id = useId();
  // Start expanded when preferences are already set (e.g. from the URL), then
  // leave open/closed to the user.
  const [initiallyOpen] = useState(budget !== "any" || preferQuiet || preferWifi);

  return (
    <details className="group rounded-lg border" open={initiallyOpen || undefined}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-lg px-3 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
        More preferences: budget, Wi-Fi, quiet
        <ChevronDown
          aria-hidden="true"
          className="size-4 shrink-0 transition-transform group-open:rotate-180"
        />
      </summary>

      <div className="flex flex-col gap-4 border-t px-3 py-3">
        <p className="flex gap-2 rounded-md bg-secondary p-3 text-xs text-secondary-foreground">
          <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>
            These are preferences, not strict filters. Budget uses qualitative price levels,
            not menu prices. Wi-Fi and quietness need sufficient approved member reports;
            otherwise each cafe labels them &ldquo;not verified&rdquo;.
          </span>
        </p>

        <fieldset className="flex min-w-0 flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">Budget per drink (USD)</legend>
          <div className="grid grid-cols-2 gap-2">
            {BUDGET_OPTIONS.map((option) => (
              <label
                key={option.value}
                className="flex min-h-11 cursor-pointer items-center justify-center rounded-lg border px-2 text-center text-sm transition-colors hover:bg-muted has-checked:border-primary has-checked:bg-secondary has-checked:font-medium has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
              >
                <input
                  type="radio"
                  name={`${id}-budget`}
                  value={option.value}
                  checked={budget === option.value}
                  onChange={() => onBudgetChange(option.value)}
                  className="sr-only"
                />
                {option.label}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="flex min-w-0 flex-col gap-1">
          <legend className="mb-1 text-sm font-medium">Nice to have</legend>
          <div className="flex min-h-11 items-center gap-3">
            <input
              id={`${id}-wifi`}
              type="checkbox"
              checked={preferWifi}
              onChange={(event) => onWifiChange(event.target.checked)}
              className="size-5 cursor-pointer accent-primary"
            />
            <label htmlFor={`${id}-wifi`} className="cursor-pointer text-sm">
              Wi-Fi
            </label>
          </div>
          <div className="flex min-h-11 items-center gap-3">
            <input
              id={`${id}-quiet`}
              type="checkbox"
              checked={preferQuiet}
              onChange={(event) => onQuietChange(event.target.checked)}
              className="size-5 cursor-pointer accent-primary"
            />
            <label htmlFor={`${id}-quiet`} className="cursor-pointer text-sm">
              Quiet place
            </label>
          </div>
        </fieldset>
      </div>
    </details>
  );
}
