import type { Favorite, Preferences, Profile, Visit } from "./schemas";

/**
 * First-party data for ONE signed-in user. Implementations act as that user
 * (RLS-scoped). They never take a user ID from the caller, so a route can't
 * read or write someone else's rows by passing the wrong ID.
 */
export interface UserDataStore {
  listFavorites(): Promise<Favorite[]>;
  /** Adds a favorite, or updates its notes if it already exists. */
  saveFavorite(placeId: string, notes: string | null | undefined): Promise<Favorite>;
  updateFavoriteNotes(placeId: string, notes: string | null): Promise<Favorite | null>;
  removeFavorite(placeId: string): Promise<void>;

  listVisits(): Promise<Visit[]>;
  markVisited(placeId: string): Promise<Visit>;
  unmarkVisited(placeId: string): Promise<void>;

  getPreferences(): Promise<Preferences>;
  savePreferences(preferences: Preferences): Promise<Preferences>;

  getProfile(): Promise<Profile>;
  updateProfile(displayName: string | null): Promise<Profile>;

  /** Deletes the auth user; first-party tables cascade. */
  deleteAccount(): Promise<void>;
}

export type UserDataErrorKind = "limit" | "invalid" | "unavailable";

export class UserDataError extends Error {
  constructor(readonly kind: UserDataErrorKind) {
    super(`User data operation failed: ${kind}`);
    this.name = "UserDataError";
  }
}
