import { CircleHelp, Clock, ExternalLink, Navigation, Star, Tag } from "lucide-react";
import { useId } from "react";

import { Badge } from "@/components/ui/badge";
import type { CafePlace } from "@/lib/places/schemas";
import { cn } from "@/lib/utils";

import { formatDistance, openStatus, priceLevelText, ratingText } from "../format";

type CafeCardProps = {
  cafe: CafePlace;
  /** The user's preferences that cannot be checked for this cafe. */
  unverifiedPreferences: readonly string[];
};

const OPEN_TONE_CLASS = {
  open: "text-emerald-800 dark:text-emerald-300",
  closed: "text-destructive",
  unknown: "text-muted-foreground",
} as const;

export function CafeCard({ cafe, unverifiedPreferences }: CafeCardProps) {
  const headingId = useId();
  const open = openStatus(cafe);

  return (
    <article
      aria-labelledby={headingId}
      className="flex flex-col gap-3 rounded-xl border bg-card p-4 text-card-foreground"
    >
      <header className="flex flex-col gap-1">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h3 id={headingId} className="text-base font-semibold leading-snug">
            {cafe.name ?? "Unnamed cafe"}
          </h3>
          {cafe.dataSource === "fixture" && (
            <Badge variant="outline" title="Fictional cafe for demonstration">
              Demo data
            </Badge>
          )}
        </div>
        {cafe.address && <p className="text-sm text-muted-foreground">{cafe.address}</p>}
        {cafe.businessStatus === "closed_temporarily" && (
          <Badge variant="destructive">Temporarily closed</Badge>
        )}
      </header>

      <ul className="flex flex-col gap-1.5 text-sm">
        <li className="flex items-center gap-2">
          <Star aria-hidden="true" className="size-4 shrink-0 text-primary" />
          <span className={cn(cafe.rating === undefined && "text-muted-foreground")}>
            {ratingText(cafe)}
          </span>
        </li>
        <li className="flex items-center gap-2">
          <Navigation aria-hidden="true" className="size-4 shrink-0 text-primary" />
          {cafe.distanceMeters === undefined ? (
            <span className="text-muted-foreground">Distance unknown</span>
          ) : (
            <span>{formatDistance(cafe.distanceMeters)} away (straight line)</span>
          )}
        </li>
        <li className="flex items-center gap-2">
          <Clock aria-hidden="true" className="size-4 shrink-0 text-primary" />
          <span className={OPEN_TONE_CLASS[open.tone]}>{open.label}</span>
        </li>
        {cafe.priceLevel && (
          <li className="flex items-center gap-2">
            <Tag aria-hidden="true" className="size-4 shrink-0 text-primary" />
            <span>{priceLevelText(cafe.priceLevel)}</span>
          </li>
        )}
      </ul>

      {cafe.googleMapsUri && (
        <a
          href={cafe.googleMapsUri}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 w-fit items-center gap-1.5 rounded-md text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <ExternalLink aria-hidden="true" className="size-4" />
          Open in Google Maps
          <span className="sr-only">: {cafe.name ?? "this cafe"} (opens in a new tab)</span>
        </a>
      )}

      {unverifiedPreferences.length > 0 && (
        <div className="flex flex-col gap-1.5 border-t pt-3">
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <CircleHelp aria-hidden="true" className="size-3.5" />
            Not verified for this cafe:
          </p>
          <ul className="flex flex-wrap gap-1.5" aria-label="Preferences not verified">
            {unverifiedPreferences.map((preference) => (
              <li key={preference}>
                <Badge variant="secondary" className="font-normal">
                  {preference}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}
