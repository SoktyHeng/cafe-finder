"use client";

import { Coffee } from "lucide-react";
import { useId, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";

import {
  isReady,
  type DiscoveryFormValues,
  type ReadyFormValues,
} from "../form-state";
import { FilterControls } from "./filter-controls";
import { LocationPicker } from "./location-picker";
import { PreferenceControls } from "./preference-controls";
import { PurposePicker } from "./purpose-picker";

const MISSING_LOCATION_MESSAGE =
  "Choose a location first: use your current location or pick an area.";

type DiscoveryFormProps = {
  initialValues: DiscoveryFormValues;
  maxRadiusMeters: number;
  /** Called only on explicit submit, with a location present. */
  onSubmit: (values: ReadyFormValues) => void;
};

/**
 * Editing controls never triggers a search. Only the "Find My Cafe" submit
 * does, which keeps billable requests user-initiated.
 */
export function DiscoveryForm({
  initialValues,
  maxRadiusMeters,
  onSubmit,
}: DiscoveryFormProps) {
  const searchInputId = useId();
  const [values, setValues] = useState<DiscoveryFormValues>(() => ({
    ...initialValues,
    radiusMeters: Math.min(initialValues.radiusMeters, maxRadiusMeters),
  }));
  const [showLocationError, setShowLocationError] = useState(false);

  const update = <K extends keyof DiscoveryFormValues>(
    key: K,
    value: DiscoveryFormValues[K],
  ) => setValues((previous) => ({ ...previous, [key]: value }));

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isReady(values)) {
      setShowLocationError(true);
      document.getElementById(searchInputId)?.focus();
      return;
    }
    onSubmit(values);
  };

  return (
    <form
      noValidate
      onSubmit={handleSubmit}
      aria-label="Cafe search"
      className="flex flex-col gap-6"
    >
      <LocationPicker
        value={values.location}
        searchInputId={searchInputId}
        error={showLocationError && !values.location ? MISSING_LOCATION_MESSAGE : undefined}
        onChange={(location) => {
          update("location", location);
          setShowLocationError(false);
        }}
      />

      <PurposePicker value={values.purpose} onChange={(purpose) => update("purpose", purpose)} />

      <FilterControls
        radiusMeters={values.radiusMeters}
        maxRadiusMeters={maxRadiusMeters}
        minRating={values.minRating}
        openNowOnly={values.openNowOnly}
        onRadiusChange={(meters) => update("radiusMeters", meters)}
        onMinRatingChange={(rating) => update("minRating", rating)}
        onOpenNowChange={(openNowOnly) => update("openNowOnly", openNowOnly)}
      />

      <PreferenceControls
        budget={values.budget}
        preferQuiet={values.preferQuiet}
        preferWifi={values.preferWifi}
        onBudgetChange={(budget) => update("budget", budget)}
        onQuietChange={(preferQuiet) => update("preferQuiet", preferQuiet)}
        onWifiChange={(preferWifi) => update("preferWifi", preferWifi)}
      />

      <Button type="submit" size="lg" className="min-h-12 w-full text-base">
        <Coffee aria-hidden="true" />
        Find My Cafe
      </Button>
    </form>
  );
}
