"use client";

import { useId } from "react";
import { BookOpen, Heart, Laptop, Users } from "lucide-react";

import type { Purpose } from "@/lib/discovery/request-schema";

import { PURPOSE_OPTIONS } from "@/lib/discovery/options";

type PurposePickerProps = {
  value: Purpose;
  onChange: (purpose: Purpose) => void;
};

export function PurposePicker({ value, onChange }: PurposePickerProps) {
  const name = useId();
  const icons = { work: Laptop, relax: BookOpen, friends: Users, date: Heart };

  return (
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="mb-1 text-base font-medium">What are you going for?</legend>
      <div className="grid grid-cols-2 gap-2">
        {PURPOSE_OPTIONS.map((option) => { const Icon = icons[option.value]; return (
          <label
            key={option.value}
            className="flex min-h-14 cursor-pointer items-center justify-start gap-2.5 rounded-xl border bg-card px-3 text-sm font-medium transition-colors hover:bg-muted has-checked:border-primary has-checked:bg-secondary has-checked:text-primary has-checked:ring-1 has-checked:ring-primary has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="sr-only"
            />
            <Icon aria-hidden="true" className="size-4 shrink-0" />{option.label}
          </label>
        ); })}
      </div>
    </fieldset>
  );
}
