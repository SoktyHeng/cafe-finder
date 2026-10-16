import { Check, CircleHelp, X } from "lucide-react";

import type { Amenities } from "@/lib/places/schemas";

import { AMENITY_LABELS, groupAmenities } from "../amenity-labels";

/** Google-reported amenities as Yes / No / not listed. Wi-Fi and noise are never claimed. */
export function AmenitiesList({ amenities, source }: { amenities: Amenities; source: "google" | "fixture" }) {
  const { yes, no, unknown } = groupAmenities(amenities);
  const sourceName = source === "google" ? "Google" : "demo data";

  return (
    <div className="flex flex-col gap-3 text-sm">
      {yes.length + no.length === 0 ? (
        <p className="text-muted-foreground">No amenity information from {sourceName}.</p>
      ) : (
        <ul className="grid gap-1.5 sm:grid-cols-2" aria-label={`Amenities according to ${sourceName}`}>
          {yes.map((key) => (
            <li key={key} className="flex items-center gap-2">
              <Check aria-hidden="true" className="size-4 shrink-0 text-emerald-700 dark:text-emerald-400" />
              <span>
                {AMENITY_LABELS[key]}
                <span className="sr-only">: yes</span>
              </span>
            </li>
          ))}
          {no.map((key) => (
            <li key={key} className="flex items-center gap-2 text-muted-foreground">
              <X aria-hidden="true" className="size-4 shrink-0" />
              <span>
                <span className="sr-only">Not available: </span>
                {AMENITY_LABELS[key]}
                <span aria-hidden="true"> (no)</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {unknown.length > 0 && yes.length + no.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Not listed by {sourceName}: {unknown.map((key) => AMENITY_LABELS[key].toLowerCase()).join(", ")}.
        </p>
      )}
      <p className="flex gap-2 rounded-md bg-secondary p-3 text-xs text-secondary-foreground">
        <CircleHelp aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        Wi-Fi and noise level aren&apos;t provided by Google, so Cafe Finder can&apos;t verify them.
      </p>
    </div>
  );
}
