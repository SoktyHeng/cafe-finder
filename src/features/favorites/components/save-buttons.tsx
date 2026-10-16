"use client";

import { Check, Footprints, Heart } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-provider";
import { loginPath } from "@/lib/security/safe-redirect";
import { cn } from "@/lib/utils";

import { useSavedPlaces } from "../saved-places-provider";

type SaveButtonProps = { placeId: string; placeName: string; className?: string };

function useCurrentPath() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  return search ? `${pathname}?${search}` : pathname;
}

/** Guests see a sign-in prompt; nothing at all when sign-in isn't configured. */
function SignInToSave({ className }: { className?: string }) {
  const current = useCurrentPath();
  return (
    <Button asChild size="lg" variant="ghost" className={cn("min-h-11 px-3", className)}>
      <Link href={loginPath(current)}>
        <Heart aria-hidden="true" />
        Sign in to save
      </Link>
    </Button>
  );
}

export function FavoriteButton({ placeId, placeName, className }: SaveButtonProps) {
  const auth = useAuth();
  const saved = useSavedPlaces();
  const [error, setError] = useState(false);

  if (auth.status === "unavailable" || auth.status === "loading") return null;
  if (auth.status === "signed-out") return <SignInToSave className={className} />;

  const pressed = saved.isFavorite(placeId);
  return (
    <>
      <Button
        type="button"
        size="lg"
        variant="ghost"
        className={cn("min-h-11 px-3", className)}
        aria-pressed={pressed}
        disabled={!saved.ready}
        onClick={async () => setError(!(await saved.toggle("favorite", placeId)))}
      >
        <Heart aria-hidden="true" className={cn(pressed && "fill-current text-destructive")} />
        {pressed ? "Saved" : "Save"}
        <span className="sr-only">: {placeName} {pressed ? "is in your favorites" : "to favorites"}</span>
      </Button>
      {error && (
        <span role="alert" className="sr-only">
          Couldn&apos;t update your favorites. Please try again.
        </span>
      )}
    </>
  );
}

export function VisitedButton({ placeId, placeName, className }: SaveButtonProps) {
  const auth = useAuth();
  const saved = useSavedPlaces();
  const [error, setError] = useState(false);

  if (auth.status !== "signed-in") return null;

  const pressed = saved.isVisited(placeId);
  return (
    <>
      <Button
        type="button"
        size="lg"
        variant="outline"
        className={cn("min-h-11 px-4", className)}
        aria-pressed={pressed}
        disabled={!saved.ready}
        onClick={async () => setError(!(await saved.toggle("visited", placeId)))}
      >
        {pressed ? <Check aria-hidden="true" /> : <Footprints aria-hidden="true" />}
        {pressed ? "Visited" : "Mark as visited"}
        <span className="sr-only">: {placeName}</span>
      </Button>
      {error && (
        <span role="alert" className="sr-only">
          Couldn&apos;t update your visited places. Please try again.
        </span>
      )}
    </>
  );
}
