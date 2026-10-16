"use client";

import { SlidersHorizontal } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useId, useMemo, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { toDiscoveryRequest, type ReadyFormValues } from "../form-state";
import { useNearbySearch } from "../hooks/use-nearby-search";
import { formValuesToSearchParams, searchParamsToFormValues } from "../url-state";
import { DiscoveryForm } from "./discovery-form";
import { ResultsPanel } from "./results-panel";

type DiscoveryViewProps = {
  maxRadiusMeters: number;
};

/**
 * `/discover`: the URL is the source of truth for the submitted search. A
 * search runs when the URL changes because of "Find My Cafe" (or when a
 * results link is opened); editing the form alone never searches.
 */
export function DiscoveryView({ maxRadiusMeters }: DiscoveryViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryString = searchParams.toString();
  const settingsId = useId();

  const parsed = useMemo(
    () => searchParamsToFormValues(new URLSearchParams(queryString)),
    [queryString],
  );
  const request = useMemo(
    () => (parsed.status === "ready" ? toDiscoveryRequest(parsed.values) : null),
    [parsed],
  );
  const { state, retry } = useNearbySearch(request, request ? queryString : null);

  // On small screens, settings collapse once there are results to look at.
  const [settingsOpen, setSettingsOpen] = useState(parsed.status !== "ready");

  const openSettings = () => {
    setSettingsOpen(true);
    requestAnimationFrame(() => {
      document.getElementById(settingsId)?.querySelector<HTMLElement>("input, button")?.focus();
    });
  };

  const handleSubmit = (values: ReadyFormValues) => {
    const next = formValuesToSearchParams(values).toString();
    setSettingsOpen(false);
    if (next === queryString) {
      // Same search submitted again: run it again on purpose.
      retry();
      return;
    }
    router.push(`${pathname}?${next}`, { scroll: false });
  };

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:gap-10 lg:py-10">
      <div className="flex flex-col gap-4 lg:col-span-2">
        <h1 className="text-2xl font-semibold tracking-tight">Discover cafes</h1>
        {parsed.status === "invalid" && (
          <Alert>
            <AlertDescription>
              Some settings in this link were not valid and have been reset. Check
              them and press Find My Cafe.
            </AlertDescription>
          </Alert>
        )}
      </div>

      <aside aria-label="Search settings" className="flex min-w-0 flex-col gap-3">
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="min-h-11 w-full lg:hidden"
          aria-expanded={settingsOpen}
          aria-controls={settingsId}
          onClick={() => setSettingsOpen((open) => !open)}
        >
          <SlidersHorizontal aria-hidden="true" />
          {settingsOpen ? "Hide search settings" : "Edit search"}
        </Button>
        <div id={settingsId} className={cn(!settingsOpen && "hidden lg:block")}>
          <DiscoveryForm
            // Reset the form whenever a different search is loaded from the URL.
            key={queryString}
            initialValues={parsed.values}
            maxRadiusMeters={maxRadiusMeters}
            onSubmit={handleSubmit}
          />
        </div>
      </aside>

      <ResultsPanel
        state={state}
        request={request}
        locationLabel={parsed.status === "ready" ? parsed.values.location.label : null}
        onRetry={retry}
        onEditSearch={openSettings}
      />
    </div>
  );
}
