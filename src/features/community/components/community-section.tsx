"use client";

import { Flag, ThumbsDown, ThumbsUp, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId, useState, type FormEvent } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/features/auth/auth-provider";
import { describeSummary } from "@/lib/community/aggregate";
import {
  AMENITY_OPTIONS,
  COMMUNITY_AMENITIES,
  FLAG_REASONS,
  REVIEW_MAX_LENGTH,
  REVIEW_MIN_LENGTH,
  type AmenitySummary,
  type CommunityAmenity,
  type CommunityPlaceResponse,
  type CommunityReview,
  type FlagReason,
  type MyContributions,
} from "@/lib/community/schemas";
import { loginPath } from "@/lib/security/safe-redirect";

import {
  communityErrorText,
  deleteReview,
  flagContent,
  removeVote,
  saveReview,
  submitAmenities,
  useCommunity,
  vote,
} from "../community-client";
import { summaryLabel } from "./community-badges";

const STATUS_NOTE: Record<string, string> = {
  pending: "Awaiting moderation: not public yet.",
  hidden: "Hidden after reports from other members; a moderator will review it.",
  rejected: "Not published: it didn't meet the community guidelines.",
};

const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium" });

/** Member-contributed amenities and reviews for one place. Never mixed with Google data. */
export function CommunitySection({ placeId, placeName }: { placeId: string; placeName: string }) {
  const auth = useAuth();
  if (auth.status === "unavailable") {
    // Guest-only site (no Supabase): no community data exists, so don't fetch.
    return (
      <p className="text-sm text-muted-foreground" data-testid="community-unavailable">
        Member reports aren&apos;t available on this site yet.
      </p>
    );
  }
  return <CommunityLoader placeId={placeId} placeName={placeName} />;
}

function CommunityLoader({ placeId, placeName }: { placeId: string; placeName: string }) {
  const [version, setVersion] = useState(0);
  const { state, retry } = useCommunity(placeId, version);
  const refresh = () => setVersion((value) => value + 1);

  // Keep showing the last good data while a refresh after an edit loads, so
  // forms (and their confirmation messages) aren't unmounted mid-interaction.
  const latest = state.status === "done" && state.outcome.ok ? state.outcome.data : null;
  const [shown, setShown] = useState<CommunityPlaceResponse | null>(null);
  if (latest && latest !== shown) setShown(latest);
  const data = latest ?? (state.status === "loading" ? shown : null);

  return (
    <div className="flex flex-col gap-5" data-testid="community-section">
      <p className="flex items-start gap-2 rounded-md bg-secondary p-3 text-sm text-secondary-foreground">
        <Users aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <span>
          Shared by Cafe Finder members, not Google. Reports are moderated and may be out of date.{" "}
          <Link href="/community-guidelines" className="underline underline-offset-2">
            Community guidelines
          </Link>
        </span>
      </p>

      {state.status !== "done" && !data && (
        <div aria-hidden="true" className="flex flex-col gap-2">
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-16 w-full" />
        </div>
      )}
      {state.status === "done" && !state.outcome.ok && (
        <Alert>
          <AlertDescription>
            {state.outcome.code === "UPSTREAM_UNAVAILABLE"
              ? "Community reports aren't available right now."
              : communityErrorText(state.outcome.code)}{" "}
            <Button variant="link" className="h-auto p-0" onClick={retry}>
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {data && (
        <div aria-busy={state.status === "loading"} className="flex flex-col gap-5">
          <CommunityContent data={data} placeName={placeName} onChanged={refresh} />
        </div>
      )}
    </div>
  );
}

function CommunityContent({
  data,
  placeName,
  onChanged,
}: {
  data: CommunityPlaceResponse;
  placeName: string;
  onChanged: () => void;
}) {
  const auth = useAuth();
  const pathname = usePathname();
  const signedIn = auth.status === "signed-in" && data.mine !== null;

  return (
    <>
      <AmenitySummaries summaries={data.amenities} />
      {signedIn && data.mine ? (
        <AmenityReportForm placeId={data.placeId} mine={data.mine} onChanged={onChanged} />
      ) : (
        auth.status === "signed-out" && (
          <Button asChild variant="outline" size="lg" className="min-h-11 w-fit px-4">
            <Link href={loginPath(pathname)}>Sign in to report amenities or write a review</Link>
          </Button>
        )
      )}
      <ReviewsBlock data={data} placeName={placeName} signedIn={signedIn} onChanged={onChanged} />
    </>
  );
}

function AmenitySummaries({ summaries }: { summaries: readonly AmenitySummary[] }) {
  const byAmenity = new Map(summaries.map((summary) => [summary.amenity, summary]));
  return (
    <div className="flex flex-col gap-2">
      <h3 className="font-medium">Amenities reported by members</h3>
      <ul className="grid gap-2 sm:grid-cols-2" aria-label="Member amenity reports">
        {COMMUNITY_AMENITIES.map((amenity) => {
          const summary = byAmenity.get(amenity);
          return (
            <li key={amenity} className="flex flex-col gap-0.5 rounded-lg border p-3 text-sm">
              {summary ? (
                <>
                  <span className="font-medium">{summaryLabel(summary)}</span>
                  <span className="text-xs text-muted-foreground">{describeSummary(summary)}</span>
                  {!summary.sufficient && (
                    <span className="text-xs text-muted-foreground">Not enough reports yet to affect recommendations.</span>
                  )}
                </>
              ) : (
                <>
                  <span className="font-medium">{AMENITY_OPTIONS[amenity].label}: unknown</span>
                  <span className="text-xs text-muted-foreground">No member reports yet.</span>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const todayIso = () => new Date().toISOString().slice(0, 10);
const yearAgoIso = () => new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10);

function AmenityReportForm({ placeId, mine, onChanged }: { placeId: string; mine: MyContributions; onChanged: () => void }) {
  const id = useId();
  const existing = new Map(mine.reports.map((report) => [report.amenity, report]));
  const [answers, setAnswers] = useState<Partial<Record<CommunityAmenity, string>>>(() =>
    Object.fromEntries(mine.reports.map((report) => [report.amenity, report.value])),
  );
  const [observedOn, setObservedOn] = useState(todayIso);
  const [status, setStatus] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, setPending] = useState(false);

  const chosen = COMMUNITY_AMENITIES.flatMap((amenity) =>
    answers[amenity] ? [{ amenity, value: answers[amenity] as string }] : [],
  );

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (chosen.length === 0) {
      setStatus({ tone: "error", text: "Choose at least one answer." });
      return;
    }
    setPending(true);
    const outcome = await submitAmenities(placeId, { answers: chosen, observedOn });
    setPending(false);
    if (outcome.ok) {
      setStatus({ tone: "ok", text: "Thanks! Your report is saved." });
      onChanged();
    } else {
      setStatus({ tone: "error", text: communityErrorText(outcome.code) });
    }
  };

  return (
    <details className="group rounded-lg border" open={mine.reports.length === 0 || undefined}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center px-3 font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
        {mine.reports.length > 0 ? "Update your amenity report" : "Report what you found"}
      </summary>
      <form onSubmit={submit} className="flex flex-col gap-4 border-t p-3" aria-label="Amenity report">
        <p className="text-xs text-muted-foreground">Answer only what you noticed. Skipped items stay unchanged.</p>
        {COMMUNITY_AMENITIES.map((amenity) => {
          const options = AMENITY_OPTIONS[amenity];
          const own = existing.get(amenity);
          return (
            <fieldset key={amenity} className="flex flex-col gap-1.5">
              <legend className="text-sm font-medium">{options.label}</legend>
              <div className="flex flex-wrap gap-2">
                {Object.entries(options.values).map(([value, option]) => (
                  <label
                    key={value}
                    className="flex min-h-11 cursor-pointer items-center rounded-lg border px-3 text-sm has-checked:border-primary has-checked:bg-secondary has-checked:font-medium has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
                  >
                    <input
                      type="radio"
                      name={`${id}-${amenity}`}
                      value={value}
                      checked={answers[amenity] === value}
                      onChange={() => setAnswers((previous) => ({ ...previous, [amenity]: value }))}
                      className="sr-only"
                    />
                    {option.label}
                  </label>
                ))}
              </div>
              {own && own.status !== "approved" && (
                <p className="text-xs text-muted-foreground">Your report: {STATUS_NOTE[own.status]}</p>
              )}
            </fieldset>
          );
        })}
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-date`} className="text-sm font-medium">
            When did you visit?
          </label>
          <input
            id={`${id}-date`}
            type="date"
            value={observedOn}
            min={yearAgoIso()}
            max={todayIso()}
            required
            onChange={(event) => setObservedOn(event.target.value)}
            className="h-11 w-fit rounded-lg border border-input bg-background px-3"
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" size="lg" className="min-h-11 px-4" disabled={pending}>
            {pending ? "Saving…" : "Submit report"}
          </Button>
          {status && (
            <span role={status.tone === "error" ? "alert" : "status"} className="text-sm">
              {status.text}
            </span>
          )}
        </div>
      </form>
    </details>
  );
}

function Stars({ rating }: { rating: number }) {
  return (
    <span aria-label={`Rated ${rating} out of 5`} className="text-primary">
      {"★".repeat(rating)}
      <span className="text-muted-foreground/50">{"★".repeat(5 - rating)}</span>
    </span>
  );
}

function ReviewsBlock({
  data,
  placeName,
  signedIn,
  onChanged,
}: {
  data: CommunityPlaceResponse;
  placeName: string;
  signedIn: boolean;
  onChanged: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="font-medium">Member reviews ({data.reviews.length})</h3>
      {signedIn && data.mine && <OwnReviewForm placeId={data.placeId} placeName={placeName} mine={data.mine} onChanged={onChanged} />}
      {data.reviews.length === 0 ? (
        <p className="text-sm text-muted-foreground">No member reviews yet.</p>
      ) : (
        <ul className="flex flex-col gap-3" aria-label="Member reviews">
          {data.reviews.map((review) => (
            <li key={review.id}>
              <MemberReview review={review} mine={data.mine} signedIn={signedIn} onChanged={onChanged} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function OwnReviewForm({
  placeId,
  placeName,
  mine,
  onChanged,
}: {
  placeId: string;
  placeName: string;
  mine: MyContributions;
  onChanged: () => void;
}) {
  const id = useId();
  const [rating, setRating] = useState(mine.review?.rating ?? 0);
  const [body, setBody] = useState(mine.review?.body ?? "");
  const [status, setStatus] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const length = body.trim().length;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (rating < 1) return setStatus({ tone: "error", text: "Choose a rating." });
    if (length < REVIEW_MIN_LENGTH) return setStatus({ tone: "error", text: `Write at least ${REVIEW_MIN_LENGTH} characters.` });
    const outcome = await saveReview(placeId, { rating, body });
    if (!outcome.ok) return setStatus({ tone: "error", text: communityErrorText(outcome.code) });
    setStatus({
      tone: "ok",
      text: outcome.status === "pending" ? "Saved. It contains a link or contact details, so a moderator will check it first." : "Your review is published.",
    });
    onChanged();
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-lg border p-3" aria-label="Your review">
      <p className="text-sm font-medium">{mine.review ? "Your review" : `Review ${placeName}`}</p>
      {mine.review && mine.review.status !== "approved" && (
        <p className="text-xs text-muted-foreground">{STATUS_NOTE[mine.review.status]}</p>
      )}
      <fieldset className="flex flex-col gap-1.5">
        <legend className="text-sm">Your rating</legend>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((value) => (
            <label
              key={value}
              className="flex size-11 cursor-pointer items-center justify-center rounded-lg border text-sm has-checked:border-primary has-checked:bg-secondary has-checked:font-semibold has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
            >
              <input type="radio" name={`${id}-rating`} value={value} checked={rating === value} onChange={() => setRating(value)} className="sr-only" />
              {/* One complete string: split text nodes can lose the space in accessible names. */}
              <span aria-hidden="true">{value}</span>
              <span className="sr-only">{`${value} out of 5`}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-body`} className="text-sm">
          What was it like? <span className="text-muted-foreground">(no contact details or links)</span>
        </label>
        <textarea
          id={`${id}-body`}
          value={body}
          rows={4}
          maxLength={REVIEW_MAX_LENGTH}
          onChange={(event) => setBody(event.target.value)}
          aria-describedby={`${id}-count`}
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        <span id={`${id}-count`} className="text-xs text-muted-foreground">
          {length}/{REVIEW_MAX_LENGTH} characters (minimum {REVIEW_MIN_LENGTH})
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="lg" className="min-h-11 px-4">
          {mine.review ? "Update review" : "Post review"}
        </Button>
        {mine.review && (
          <Button
            type="button"
            variant="ghost"
            size="lg"
            className="min-h-11 px-4"
            onClick={async () => {
              const outcome = await deleteReview(placeId);
              if (outcome.ok) onChanged();
              else setStatus({ tone: "error", text: communityErrorText(outcome.code) });
            }}
          >
            Delete review
          </Button>
        )}
        {status && (
          <span role={status.tone === "error" ? "alert" : "status"} className="text-sm">
            {status.text}
          </span>
        )}
      </div>
    </form>
  );
}

function MemberReview({
  review,
  mine,
  signedIn,
  onChanged,
}: {
  review: CommunityReview;
  mine: MyContributions | null;
  signedIn: boolean;
  onChanged: () => void;
}) {
  const reasonId = useId();
  const myVote = mine?.votes[review.id];
  const alreadyFlagged = mine?.flaggedReviewIds.includes(review.id) ?? false;
  const [flagging, setFlagging] = useState(false);
  const [reason, setReason] = useState<FlagReason>("spam");
  const [message, setMessage] = useState<string | null>(null);
  const canInteract = signedIn && !review.isOwn;

  const castVote = async (helpful: boolean) => {
    const outcome = myVote === helpful ? await removeVote(review.id) : await vote(review.id, helpful);
    if (outcome.ok) onChanged();
    else setMessage(communityErrorText(outcome.code));
  };

  const submitFlag = async () => {
    const outcome = await flagContent({ targetType: "review", targetId: review.id, reason });
    setFlagging(false);
    setMessage(outcome.ok ? "Thanks, a moderator will take a look." : communityErrorText(outcome.code));
    if (outcome.ok) onChanged();
  };

  return (
    <article className="flex flex-col gap-2 rounded-lg border p-4" aria-label={`Member review, ${review.rating} out of 5`}>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Stars rating={review.rating} />
        <span className="text-muted-foreground">
          Cafe Finder member · {dateFormat.format(new Date(review.createdAt))}
          {review.edited && " · edited"}
        </span>
        {review.confirmedVisit && <Badge variant="secondary">Confirmed visit</Badge>}
        {review.isOwn && <Badge variant="outline">You</Badge>}
      </div>
      <p className="text-sm whitespace-pre-line">{review.body}</p>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>
          {review.helpfulCount} found this helpful
          {review.notHelpfulCount > 0 && ` · ${review.notHelpfulCount} didn't`}
        </span>
        {canInteract && (
          <>
            <Button type="button" variant="ghost" size="lg" className="min-h-11 px-2" aria-pressed={myVote === true} onClick={() => castVote(true)}>
              <ThumbsUp aria-hidden="true" />
              Helpful
            </Button>
            <Button type="button" variant="ghost" size="lg" className="min-h-11 px-2" aria-pressed={myVote === false} onClick={() => castVote(false)}>
              <ThumbsDown aria-hidden="true" />
              Not helpful
            </Button>
            {alreadyFlagged ? (
              <span>Reported</span>
            ) : flagging ? (
              <span className="flex flex-wrap items-center gap-2">
                <label htmlFor={reasonId} className="sr-only">
                  Reason for reporting
                </label>
                <select
                  id={reasonId}
                  value={reason}
                  onChange={(event) => setReason(event.target.value as FlagReason)}
                  className="h-11 rounded-lg border border-input bg-background px-2 text-sm"
                >
                  {FLAG_REASONS.map((option) => (
                    <option key={option} value={option}>
                      {FLAG_REASON_LABELS[option]}
                    </option>
                  ))}
                </select>
                <Button type="button" size="lg" variant="destructive" className="min-h-11 px-3" onClick={submitFlag}>
                  Send report
                </Button>
                <Button type="button" size="lg" variant="ghost" className="min-h-11 px-3" onClick={() => setFlagging(false)}>
                  Cancel
                </Button>
              </span>
            ) : (
              <Button type="button" variant="ghost" size="lg" className="min-h-11 px-2" onClick={() => setFlagging(true)}>
                <Flag aria-hidden="true" />
                Report
              </Button>
            )}
          </>
        )}
      </div>
      {message && (
        <p role="status" className="text-xs">
          {message}
        </p>
      )}
    </article>
  );
}

const FLAG_REASON_LABELS: Record<FlagReason, string> = {
  spam: "Spam or advertising",
  offensive: "Offensive or abusive",
  incorrect: "Clearly false",
  personal_info: "Shares personal information",
  other: "Something else",
};
