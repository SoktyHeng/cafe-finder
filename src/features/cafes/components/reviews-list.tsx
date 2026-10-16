import { ExternalLink, Star } from "lucide-react";

import type { PlaceReview } from "@/lib/places/schemas";

/**
 * Google reviews shown as provided, each with its author's name, photo and
 * profile link (required attribution). Never edited, stored or presented as
 * Cafe Finder content.
 */
export function ReviewsList({
  reviews,
  placeMapsUri,
}: {
  reviews: readonly PlaceReview[];
  placeMapsUri: string | undefined;
}) {
  return (
    <div className="flex flex-col gap-4">
      {reviews.length === 0 ? (
        <p className="text-sm text-muted-foreground">No reviews available.</p>
      ) : (
        <ul className="flex flex-col gap-4" aria-label="Google reviews">
          {reviews.map((review, index) => (
            <li key={`${review.authorName}-${index}`} className="flex flex-col gap-2 rounded-lg border p-4">
              <div className="flex items-center gap-3">
                {review.authorPhotoUri ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={review.authorPhotoUri}
                    alt=""
                    width={36}
                    height={36}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="size-9 rounded-full bg-muted"
                  />
                ) : (
                  <span aria-hidden="true" className="flex size-9 items-center justify-center rounded-full bg-muted text-sm font-medium">
                    {review.authorName.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <div className="flex min-w-0 flex-col">
                  {review.authorUri ? (
                    <a href={review.authorUri} target="_blank" rel="noopener noreferrer" className="font-medium underline-offset-2 hover:underline">
                      {review.authorName}
                    </a>
                  ) : (
                    <span className="font-medium">{review.authorName}</span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {review.rating !== undefined && (
                      <>
                        <Star aria-hidden="true" className="mr-1 inline size-3 fill-current align-[-1px] text-primary" />
                        <span className="sr-only">Rated </span>
                        {review.rating} of 5
                      </>
                    )}
                    {review.rating !== undefined && review.relativePublishTime && " · "}
                    {review.relativePublishTime}
                  </span>
                </div>
              </div>
              {review.text && <p className="text-sm whitespace-pre-line">{review.text}</p>}
              <div className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                {review.translated && <span>Translated by Google</span>}
                {review.googleMapsUri && (
                  <a href={review.googleMapsUri} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                    View on Google Maps
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {placeMapsUri && (
        <a
          href={placeMapsUri}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 w-fit items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          <ExternalLink aria-hidden="true" className="size-4" />
          See all reviews on Google Maps
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      )}
    </div>
  );
}
