import { AlertTriangle, Check, ChevronDown, CircleHelp } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { Factor } from "@/lib/recommendation/config";
import type { Confidence, Recommendation } from "@/lib/recommendation/schemas";
import { cn } from "@/lib/utils";

const FACTOR_LABELS: Record<Factor, string> = {
  rating: "Rating",
  distance: "Distance",
  openNow: "Open now",
  atmosphere: "Atmosphere for your purpose",
  budget: "Budget fit (price level)",
  amenities: "Wi-Fi / quiet",
};

const CONFIDENCE_LABELS: Record<Confidence, string> = {
  high: "High confidence",
  medium: "Medium confidence",
  low: "Limited data",
};

const percent = (value: number) => `${Math.round(value * 100)}%`;

/** "86% match" with its confidence, or "Limited data" when a number would overstate it. */
export function MatchBadge({ recommendation }: { recommendation: Recommendation }) {
  const { matchPercent, confidence } = recommendation;
  return (
    <div className="flex shrink-0 flex-col items-end gap-0.5 text-right" data-testid="match-badge">
      {matchPercent === null ? (
        <Badge variant="outline" className="font-medium">
          Limited data
        </Badge>
      ) : (
        <>
          <span className="text-lg leading-none font-semibold text-primary tabular-nums">
            {matchPercent}% match
          </span>
          <span className="text-xs text-muted-foreground">{CONFIDENCE_LABELS[confidence]}</span>
        </>
      )}
    </div>
  );
}

/** Evidence-backed reasons, cautions, unverified preferences and the score breakdown. */
export function MatchExplanation({ recommendation }: { recommendation: Recommendation }) {
  const { knownMatchReasons, cautions, unverifiedPreferences, factors, coverage } = recommendation;
  const totalWeight = factors.reduce((sum, factor) => sum + factor.weight, 0);
  const knownCount = factors.filter((factor) => factor.score !== null).length;

  return (
    <div className="flex flex-col gap-3 border-t pt-3 text-sm">
      {knownMatchReasons.length > 0 && (
        <ul aria-label="Why it matches" className="flex flex-col gap-1">
          {knownMatchReasons.map((reason) => (
            <li key={reason} className="flex gap-2">
              <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-emerald-700 dark:text-emerald-400" />
              {reason}
            </li>
          ))}
        </ul>
      )}

      {cautions.length > 0 && (
        <ul aria-label="Things to know" className="flex flex-col gap-1">
          {cautions.map((caution) => (
            <li key={caution} className="flex gap-2 text-muted-foreground">
              <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-400" />
              {caution}
            </li>
          ))}
        </ul>
      )}

      {unverifiedPreferences.length > 0 && (
        <div className="flex flex-col gap-1.5">
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

      <details className="group rounded-lg border">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-lg px-3 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
          How this match is calculated
          <ChevronDown aria-hidden="true" className="size-4 shrink-0 transition-transform group-open:rotate-180" />
        </summary>
        <div className="flex flex-col gap-2 border-t px-3 py-3">
          <p className="text-xs text-muted-foreground">
            Based on {knownCount} of {factors.length} factors with data ({percent(coverage)} of
            the weighting). Factors without data count as neutral (50%).
          </p>
          <table className="w-full text-left text-xs">
            <caption className="sr-only">Score breakdown</caption>
            <thead>
              <tr className="text-muted-foreground">
                <th scope="col" className="py-1 font-medium">Factor</th>
                <th scope="col" className="py-1 text-right font-medium">Weight</th>
                <th scope="col" className="py-1 text-right font-medium">Result</th>
              </tr>
            </thead>
            <tbody>
              {factors.map(({ factor, weight, score }) => (
                <tr key={factor} className="border-t">
                  <th scope="row" className="py-1.5 font-normal">{FACTOR_LABELS[factor]}</th>
                  <td className="py-1.5 text-right tabular-nums">
                    {totalWeight > 0 ? percent(weight / totalWeight) : "–"}
                  </td>
                  <td
                    className={cn(
                      "py-1.5 text-right tabular-nums",
                      score === null && "text-muted-foreground",
                    )}
                  >
                    {score === null ? "Unknown (neutral)" : percent(score)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
