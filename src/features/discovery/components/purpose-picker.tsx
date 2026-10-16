"use client";

import { useId } from "react";

import type { Purpose } from "@/lib/discovery/request-schema";

import { PURPOSE_OPTIONS } from "@/lib/discovery/options";

type PurposePickerProps = {
  value: Purpose;
  onChange: (purpose: Purpose) => void;
};

export function PurposePicker({ value, onChange }: PurposePickerProps) {
  const name = useId();

  return (
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="mb-1 text-base font-medium">What are you going for?</legend>
      <div className="grid grid-cols-2 gap-2">
        {PURPOSE_OPTIONS.map((option) => (
          <label
            key={option.value}
            className="flex min-h-11 cursor-pointer items-center justify-center rounded-lg border px-3 text-center text-sm font-medium transition-colors hover:bg-muted has-checked:border-primary has-checked:bg-primary has-checked:text-primary-foreground has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="sr-only"
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
