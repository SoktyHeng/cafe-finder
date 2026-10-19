import { ChevronRight, Clock, MapPin, Navigation, Route, Star, Tag } from "lucide-react";
import Link from "next/link";
import { useId } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CommunityBadges } from "@/features/community/components/community-badges";
import { FavoriteButton } from "@/features/favorites/components/save-buttons";
import { directionsUrl } from "@/lib/google/maps-urls";
import type { Recommendation } from "@/lib/recommendation/schemas";
import { cn } from "@/lib/utils";

import { formatDistance, openStatus, priceLevelText, ratingText } from "../format";
import { cafeCardDomId } from "../map-geometry";
import { MatchBadge, MatchExplanation } from "./match-explanation";

type CafeCardProps = {
  recommendation: Recommendation;
  /** 1-based position in the ranked list. */
  rank: number;
  detailsHref: string;
  /** Highlighted because it is selected on the map. */
  selected?: boolean;
  /** Present when the cafe has a position on the map. */
  onShowOnMap?: () => void;
  /** Summary variant shown under the map on small screens (no explanation, no DOM id). */
  compact?: boolean;
};

const OPEN_TONE_CLASS = {
  open: "text-emerald-800 dark:text-emerald-300",
  closed: "text-destructive",
  unknown: "text-muted-foreground",
} as const;

const ACTION_CLASS = "min-h-11 px-3";

export function CafeCard({
  recommendation,
  rank,
  detailsHref,
  selected = false,
  onShowOnMap,
  compact = false,
}: CafeCardProps) {
  const headingId = useId();
  const { cafe } = recommendation;
  const open = openStatus(cafe);
  const isBestMatch = rank === 1 && recommendation.matchPercent !== null;
  const directions = directionsUrl(cafe);
  const name = cafe.name ?? "Unnamed cafe";

  return (
    <article
      id={compact ? undefined : cafeCardDomId(cafe.placeId)}
      // Focusable so a map selection can move focus here.
      tabIndex={compact ? undefined : -1}
      aria-labelledby={headingId}
      data-selected={selected || undefined}
      className={cn(
        "flex scroll-mt-4 flex-col gap-3 rounded-xl border bg-card p-4 text-card-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        selected && "border-primary ring-2 ring-primary",
      )}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground tabular-nums">
              {rank}.
            </span>
            <h3 id={headingId} className="text-base leading-snug font-semibold">
              {name}
            </h3>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {isBestMatch && <Badge>Best match</Badge>}
            {selected && <Badge variant="secondary">Selected on map</Badge>}
            {cafe.dataSource === "fixture" && (
              <Badge variant="outline" title="Fictional cafe for demonstration">
                Demo data
              </Badge>
            )}
            {cafe.businessStatus === "closed_temporarily" && (
              <Badge variant="destructive">Temporarily closed</Badge>
            )}
          </div>
          {cafe.address && <p className="text-sm text-muted-foreground">{cafe.address}</p>}
        </div>
        <MatchBadge recommendation={recommendation} />
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

      <CommunityBadges summaries={recommendation.community} />

      <div className="flex flex-wrap gap-2">
        <Button asChild size="lg" className={ACTION_CLASS}>
          <Link href={detailsHref}>
            Details
            <ChevronRight aria-hidden="true" />
            <span className="sr-only">: {name}</span>
          </Link>
        </Button>
        {directions && (
          <Button asChild size="lg" variant="outline" className={ACTION_CLASS}>
            <a href={directions} target="_blank" rel="noopener noreferrer">
              <Route aria-hidden="true" />
              Directions
              <span className="sr-only">: {name} (opens Google Maps in a new tab)</span>
            </a>
          </Button>
        )}
        <FavoriteButton placeId={cafe.placeId} placeName={name} />
        {onShowOnMap && (
          <Button
            type="button"
            size="lg"
            variant="ghost"
            className={ACTION_CLASS}
            aria-pressed={selected}
            onClick={onShowOnMap}
          >
            <MapPin aria-hidden="true" />
            Show on map
            <span className="sr-only">: {name}</span>
          </Button>
        )}
      </div>

      {!compact && <MatchExplanation recommendation={recommendation} />}
    </article>
  );
}
