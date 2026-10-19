import { Users } from "lucide-react";

import { AMENITY_OPTIONS, amenityValueOption, type AmenitySummary } from "@/lib/community/schemas";

/** "Wi-Fi: Available" or "Wi-Fi: mixed reports". */
export function summaryLabel(summary: AmenitySummary): string {
  const amenity = AMENITY_OPTIONS[summary.amenity].label;
  if (summary.conflicted) return `${amenity}: mixed reports`;
  return `${amenity}: ${amenityValueOption(summary.amenity, summary.consensus)?.label ?? summary.consensus}`;
}

/**
 * Compact member-report summary for result cards. Only summaries with enough
 * evidence are shown here; details pages show everything with counts.
 * Always labelled as member content, separate from Google data.
 */
export function CommunityBadges({ summaries }: { summaries: readonly AmenitySummary[] | undefined }) {
  const shown = (summaries ?? []).filter((summary) => summary.sufficient);
  if (shown.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5" data-testid="community-badges">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Users aria-hidden="true" className="size-3.5" />
        From Cafe Finder members (not Google):
      </p>
      <ul className="flex flex-wrap gap-1.5" aria-label="Member reports">
        {shown.map((summary) => (
          <li
            key={summary.amenity}
            className="rounded-full border border-dashed px-2 py-0.5 text-xs"
            title={`${summary.reportCount} reports, latest ${summary.latestObservedOn}`}
          >
            {summaryLabel(summary)}
            <span className="text-muted-foreground"> · {summary.reportCount}</span>
            <span className="sr-only"> {summary.reportCount === 1 ? "report" : "reports"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
