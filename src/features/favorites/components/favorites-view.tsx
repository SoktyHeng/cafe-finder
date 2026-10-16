"use client";

import { Heart, Route, Trash2 } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";

import { GoogleMapsAttribution } from "@/components/google-maps-attribution";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { directionsUrl } from "@/lib/google/maps-urls";
import type { PlaceSummary } from "@/lib/places/schemas";
import { MAX_NOTES_LENGTH, type Favorite, type Visit } from "@/lib/user-data/schemas";

import { updateFavoriteNotes } from "../saved-places-client";
import { useSavedPlaces } from "../saved-places-provider";

type FavoritesViewProps = {
  favorites: Favorite[];
  visits: Visit[];
  summaries: Record<string, PlaceSummary>;
  degraded: boolean;
};

const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium" });
// visit_date is a calendar date ("2026-10-16"): format it in UTC so it never shifts a day.
const calendarDateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" });

/** The signed-in user's saved cafes. Details are refetched by place ID; only IDs and notes are stored. */
export function FavoritesView({ favorites: initialFavorites, visits: initialVisits, summaries, degraded }: FavoritesViewProps) {
  const saved = useSavedPlaces();
  const [favorites, setFavorites] = useState(initialFavorites);
  const [visits, setVisits] = useState(initialVisits);
  const [message, setMessage] = useState("");
  const anyGoogle = Object.values(summaries).some((summary) => summary.dataSource === "google");

  const remove = async (kind: "favorite" | "visited", placeId: string) => {
    if (await saved.toggle(kind, placeId)) {
      if (kind === "favorite") setFavorites((list) => list.filter((item) => item.placeId !== placeId));
      else setVisits((list) => list.filter((item) => item.placeId !== placeId));
      setMessage(kind === "favorite" ? "Removed from favorites." : "Removed from visited.");
    } else {
      setMessage("Couldn't update your saved cafes. Please try again.");
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Your favorites</h1>
        <p className="text-sm text-muted-foreground">
          Saved to your account, available on any device you sign in on.
        </p>
        {degraded && (
          <p className="text-sm text-muted-foreground">
            Some cafe details couldn&apos;t load right now. Your saved list is complete; reload later for names
            and addresses.
          </p>
        )}
        {anyGoogle && <GoogleMapsAttribution />}
        <p role="status" className="sr-only">
          {message}
        </p>
      </div>

      <section aria-labelledby="favorites-heading" className="flex flex-col gap-3">
        <h2 id="favorites-heading" className="text-lg font-semibold">
          Favorites ({favorites.length})
        </h2>
        {favorites.length === 0 ? (
          <div className="flex flex-col items-start gap-2 rounded-xl border border-dashed p-6">
            <Heart aria-hidden="true" className="size-6 text-muted-foreground" />
            <p>No favorites yet.</p>
            <p className="text-sm text-muted-foreground">Tap &ldquo;Save&rdquo; on any cafe to keep it here.</p>
            <Button asChild size="lg" className="mt-1 min-h-11 px-4">
              <Link href="/discover">Find cafes</Link>
            </Button>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {favorites.map((favorite) => (
              <li key={favorite.placeId}>
                <FavoriteItem
                  favorite={favorite}
                  summary={summaries[favorite.placeId]}
                  visited={visits.some((visit) => visit.placeId === favorite.placeId)}
                  onRemove={() => remove("favorite", favorite.placeId)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="visited-heading" className="flex flex-col gap-3">
        <h2 id="visited-heading" className="text-lg font-semibold">
          Visited ({visits.length})
        </h2>
        {visits.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Mark cafes as visited from their details page to keep track of where you&apos;ve been.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {visits.map((visit) => {
              const name = summaries[visit.placeId]?.name ?? "Cafe details unavailable";
              return (
                <li key={visit.placeId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
                  <div className="flex flex-col">
                    <Link href={`/cafes/${encodeURIComponent(visit.placeId)}`} className="font-medium underline-offset-4 hover:underline">
                      {name}
                    </Link>
                    {visit.visitDate && (
                      <span className="text-xs text-muted-foreground">Visited {calendarDateFormat.format(new Date(visit.visitDate))}</span>
                    )}
                  </div>
                  <Button type="button" variant="ghost" size="lg" className="min-h-11 px-3" onClick={() => remove("visited", visit.placeId)}>
                    <Trash2 aria-hidden="true" />
                    Remove
                    <span className="sr-only">: {name} from visited</span>
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function FavoriteItem({
  favorite,
  summary,
  visited,
  onRemove,
}: {
  favorite: Favorite;
  summary: PlaceSummary | undefined;
  visited: boolean;
  onRemove: () => void;
}) {
  const notesId = useId();
  const [notes, setNotes] = useState(favorite.notes ?? "");
  const [savedNotes, setSavedNotes] = useState(favorite.notes ?? "");
  const [status, setStatus] = useState("");
  const name = summary?.name ?? "Cafe details unavailable";
  const directions = summary ? directionsUrl(summary) : undefined;

  const saveNotes = async () => {
    setStatus("Saving…");
    const outcome = await updateFavoriteNotes(favorite.placeId, notes.trim() === "" ? null : notes);
    if (outcome.ok) {
      setSavedNotes(notes);
      setStatus("Notes saved.");
    } else {
      setStatus("Couldn't save notes. Please try again.");
    }
  };

  return (
    <article aria-label={name} className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <div className="flex flex-col gap-1">
        <Link href={`/cafes/${encodeURIComponent(favorite.placeId)}`} className="text-base font-semibold underline-offset-4 hover:underline">
          {name}
        </Link>
        <div className="flex flex-wrap gap-1.5">
          {summary?.dataSource === "fixture" && <Badge variant="outline">Demo data</Badge>}
          {visited && <Badge variant="secondary">Visited</Badge>}
          {summary?.businessStatus === "closed_temporarily" && <Badge variant="destructive">Temporarily closed</Badge>}
          {summary?.businessStatus === "closed_permanently" && <Badge variant="destructive">Permanently closed</Badge>}
        </div>
        {summary?.address && <p className="text-sm text-muted-foreground">{summary.address}</p>}
        <p className="text-xs text-muted-foreground">Saved {dateFormat.format(new Date(favorite.createdAt))}</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={notesId} className="text-sm font-medium">
          Your notes <span className="font-normal text-muted-foreground">(private)</span>
        </label>
        <textarea
          id={notesId}
          value={notes}
          maxLength={MAX_NOTES_LENGTH}
          rows={2}
          onChange={(event) => setNotes(event.target.value)}
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        <div className="flex items-center gap-3">
          <Button type="button" size="lg" variant="outline" className="min-h-11 px-4" disabled={notes === savedNotes} onClick={saveNotes}>
            Save notes
          </Button>
          <span role="status" className="text-xs text-muted-foreground">
            {status}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {directions && (
          <Button asChild size="lg" variant="outline" className="min-h-11 px-3">
            <a href={directions} target="_blank" rel="noopener noreferrer">
              <Route aria-hidden="true" />
              Directions
              <span className="sr-only">: {name} (opens Google Maps in a new tab)</span>
            </a>
          </Button>
        )}
        <Button type="button" size="lg" variant="ghost" className="min-h-11 px-3" onClick={onRemove}>
          <Trash2 aria-hidden="true" />
          Remove
          <span className="sr-only">: {name} from favorites</span>
        </Button>
      </div>
    </article>
  );
}
