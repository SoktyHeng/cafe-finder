"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { useAuth } from "@/features/auth/auth-provider";

import {
  addFavorite,
  listFavorites,
  listVisits,
  markVisited,
  removeFavorite,
  unmarkVisited,
} from "./saved-places-client";

type Kind = "favorite" | "visited";

type SavedPlaces = {
  /** True once the signed-in user's saved IDs have loaded. */
  ready: boolean;
  isFavorite: (placeId: string) => boolean;
  isVisited: (placeId: string) => boolean;
  /** Optimistic toggle; resolves `false` (and rolls back) if the server refused. */
  toggle: (kind: Kind, placeId: string) => Promise<boolean>;
};

const SavedPlacesContext = createContext<SavedPlaces>({
  ready: false,
  isFavorite: () => false,
  isVisited: () => false,
  toggle: async () => false,
});

type Sets = { userId: string; favorites: Set<string>; visits: Set<string> };

/** Loads the signed-in user's favorite and visited place IDs once per session. */
export function SavedPlacesProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const userId = auth.status === "signed-in" ? auth.user.id : null;
  const [sets, setSets] = useState<Sets | null>(null);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    void Promise.all([listFavorites(), listVisits()]).then(([favorites, visits]) => {
      if (!active) return;
      setSets({
        userId,
        favorites: new Set(favorites.ok ? favorites.data.favorites.map((item) => item.placeId) : []),
        visits: new Set(visits.ok ? visits.data.visits.map((item) => item.placeId) : []),
      });
    });
    return () => {
      active = false;
    };
  }, [userId]);

  // Ignore data that belongs to a previous user (e.g. after switching accounts).
  const current = sets && sets.userId === userId ? sets : null;

  const toggle = useCallback(
    async (kind: Kind, placeId: string) => {
      if (!current) return false;
      const key = kind === "favorite" ? "favorites" : "visits";
      const wasSet = current[key].has(placeId);
      const update = (present: boolean) =>
        setSets((previous) => {
          if (!previous) return previous;
          const next = new Set(previous[key]);
          if (present) next.add(placeId);
          else next.delete(placeId);
          return { ...previous, [key]: next };
        });

      update(!wasSet);
      const outcome =
        kind === "favorite"
          ? await (wasSet ? removeFavorite(placeId) : addFavorite(placeId))
          : await (wasSet ? unmarkVisited(placeId) : markVisited(placeId));
      if (!outcome.ok) update(wasSet);
      return outcome.ok;
    },
    [current],
  );

  const value = useMemo<SavedPlaces>(
    () => ({
      ready: current !== null,
      isFavorite: (placeId) => current?.favorites.has(placeId) ?? false,
      isVisited: (placeId) => current?.visits.has(placeId) ?? false,
      toggle,
    }),
    [current, toggle],
  );

  return <SavedPlacesContext.Provider value={value}>{children}</SavedPlacesContext.Provider>;
}

export function useSavedPlaces(): SavedPlaces {
  return useContext(SavedPlacesContext);
}
