"use client";

import { ImageOff } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { PlacePhoto } from "@/lib/places/schemas";

/** Display width requested from the photo endpoint (one of its allowlisted widths). */
const PHOTO_WIDTH = 800;

export function placePhotoSrc(photoName: string): string {
  const params = new URLSearchParams({ name: photoName, maxWidthPx: String(PHOTO_WIDTH) });
  return `/api/places/photo?${params.toString()}`;
}

/**
 * Photos with mandatory author credits. Every displayed photo is a billable
 * Place Photo request, so only the first loads until the user asks for more.
 */
export function PhotoGallery({ photos, placeName }: { photos: readonly PlacePhoto[]; placeName: string }) {
  const [showAll, setShowAll] = useState(false);
  if (photos.length === 0) {
    return <p className="text-sm text-muted-foreground">No photos available for this cafe.</p>;
  }
  const visible = showAll ? photos : photos.slice(0, 1);
  const hidden = photos.length - visible.length;

  return (
    <div className="flex flex-col gap-3">
      <ul className="grid gap-3 sm:grid-cols-2" aria-label="Photos">
        {visible.map((photo, index) => (
          <li key={photo.name} className={index === 0 && !showAll ? "sm:col-span-2" : undefined}>
            <Photo photo={photo} alt={`Photo ${index + 1} of ${placeName}`} />
          </li>
        ))}
      </ul>
      {hidden > 0 && (
        <Button type="button" variant="outline" size="lg" className="min-h-11 w-fit px-4" onClick={() => setShowAll(true)}>
          Show {hidden} more {hidden === 1 ? "photo" : "photos"}
        </Button>
      )}
    </div>
  );
}

function Photo({ photo, alt }: { photo: PlacePhoto; alt: string }) {
  const [failed, setFailed] = useState(false);
  const aspect = photo.widthPx && photo.heightPx ? `${photo.widthPx} / ${photo.heightPx}` : "4 / 3";

  return (
    <figure className="flex flex-col gap-1.5">
      {failed ? (
        <div
          className="flex flex-col items-center justify-center gap-1 rounded-lg bg-muted text-sm text-muted-foreground"
          style={{ aspectRatio: aspect }}
        >
          <ImageOff aria-hidden="true" className="size-5" />
          Photo unavailable
        </div>
      ) : (
        // A plain <img>: next/image would fetch and cache Google content on our server.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={placePhotoSrc(photo.name)}
          alt={alt}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="w-full rounded-lg bg-muted object-cover"
          style={{ aspectRatio: aspect }}
        />
      )}
      {photo.authorAttributions.length > 0 && (
        <figcaption className="text-xs text-muted-foreground">
          Photo:{" "}
          {photo.authorAttributions.map((author, index) => (
            <span key={`${author.displayName}-${index}`}>
              {index > 0 && ", "}
              {author.uri ? (
                <a href={author.uri} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                  {author.displayName}
                </a>
              ) : (
                author.displayName
              )}
            </span>
          ))}
        </figcaption>
      )}
    </figure>
  );
}
