import "server-only";

import type { PostgrestError } from "@supabase/supabase-js";

import type { AppSupabaseClient, VerifiedUser } from "@/lib/supabase/server";
import type {
  FavoritePlaceRow,
  UserPreferencesRow,
  VisitFeedbackRow,
} from "@/lib/supabase/database.types";

import { DEFAULT_PREFERENCES, type Favorite, type Preferences, type Visit } from "./schemas";
import { UserDataError, type UserDataStore } from "./store";

/** Postgres error codes raised by the migration's constraints and triggers. */
const CHECK_VIOLATION = "23514";
const INVALID_TEXT = "22P02";

function fail(error: PostgrestError): never {
  if (error.code === CHECK_VIOLATION && /Row limit/.test(error.message)) throw new UserDataError("limit");
  if (error.code === CHECK_VIOLATION || error.code === INVALID_TEXT) throw new UserDataError("invalid");
  throw new UserDataError("unavailable");
}

const toFavorite = (row: Pick<FavoritePlaceRow, "google_place_id" | "notes" | "created_at">): Favorite => ({
  placeId: row.google_place_id,
  notes: row.notes,
  createdAt: row.created_at,
});

const toVisit = (row: Pick<VisitFeedbackRow, "google_place_id" | "visit_date" | "created_at">): Visit => ({
  placeId: row.google_place_id,
  visitDate: row.visit_date,
  createdAt: row.created_at,
});

const toPreferences = (row: UserPreferencesRow): Preferences => ({
  purpose: row.default_purpose,
  radiusMeters: row.default_radius_m,
  minRating: row.min_rating === null ? null : Number(row.min_rating),
  openNowOnly: row.open_now_only,
  budget: row.budget_tier,
  preferQuiet: row.prefer_quiet,
  preferWifi: row.prefer_wifi,
});

const FAVORITE_COLUMNS = "google_place_id, notes, created_at";
const VISIT_COLUMNS = "google_place_id, visit_date, created_at";

/**
 * Store backed by Supabase as the signed-in user: the session's JWT is sent,
 * so Postgres RLS restricts every query to that user's rows. The user ID is
 * used only to satisfy insert policies, never to widen access.
 */
export function createSupabaseUserDataStore(client: AppSupabaseClient, user: VerifiedUser): UserDataStore {
  const ensureProfile = async () => {
    // Users created before the migration (or if the trigger failed) get rows lazily.
    await client.from("profiles").upsert({ id: user.id }, { onConflict: "id", ignoreDuplicates: true });
    await client.from("user_preferences").upsert({ user_id: user.id }, { onConflict: "user_id", ignoreDuplicates: true });
  };

  return {
    async listFavorites() {
      const { data, error } = await client
        .from("favorite_places")
        .select(FAVORITE_COLUMNS)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) fail(error);
      return data.map(toFavorite);
    },

    async saveFavorite(placeId, notes) {
      await ensureProfile();
      const { data, error } = await client
        .from("favorite_places")
        .upsert(
          { user_id: user.id, google_place_id: placeId, ...(notes !== undefined && { notes }) },
          { onConflict: "user_id,google_place_id" },
        )
        .select(FAVORITE_COLUMNS)
        .single();
      if (error) fail(error);
      return toFavorite(data);
    },

    async updateFavoriteNotes(placeId, notes) {
      const { data, error } = await client
        .from("favorite_places")
        .update({ notes })
        .eq("google_place_id", placeId)
        .select(FAVORITE_COLUMNS)
        .maybeSingle();
      if (error) fail(error);
      return data ? toFavorite(data) : null;
    },

    async removeFavorite(placeId) {
      const { error } = await client.from("favorite_places").delete().eq("google_place_id", placeId);
      if (error) fail(error);
    },

    async listVisits() {
      const { data, error } = await client
        .from("visit_feedback")
        .select(VISIT_COLUMNS)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) fail(error);
      return data.map(toVisit);
    },

    async markVisited(placeId) {
      await ensureProfile();
      const { data, error } = await client
        .from("visit_feedback")
        .upsert(
          { user_id: user.id, google_place_id: placeId, visit_date: new Date().toISOString().slice(0, 10) },
          { onConflict: "user_id,google_place_id" },
        )
        .select(VISIT_COLUMNS)
        .single();
      if (error) fail(error);
      return toVisit(data);
    },

    async unmarkVisited(placeId) {
      const { error } = await client.from("visit_feedback").delete().eq("google_place_id", placeId);
      if (error) fail(error);
    },

    async getPreferences() {
      const { data, error } = await client.from("user_preferences").select("*").maybeSingle();
      if (error) fail(error);
      return data ? toPreferences(data) : DEFAULT_PREFERENCES;
    },

    async savePreferences(preferences) {
      await ensureProfile();
      const { data, error } = await client
        .from("user_preferences")
        .upsert(
          {
            user_id: user.id,
            default_purpose: preferences.purpose,
            default_radius_m: preferences.radiusMeters,
            min_rating: preferences.minRating,
            open_now_only: preferences.openNowOnly,
            budget_tier: preferences.budget,
            prefer_quiet: preferences.preferQuiet,
            prefer_wifi: preferences.preferWifi,
          },
          { onConflict: "user_id" },
        )
        .select("*")
        .single();
      if (error) fail(error);
      return toPreferences(data);
    },

    async getProfile() {
      const { data, error } = await client.from("profiles").select("display_name").maybeSingle();
      if (error) fail(error);
      return { displayName: data?.display_name ?? null, email: user.email ?? null };
    },

    async updateProfile(displayName) {
      const { data, error } = await client
        .from("profiles")
        .upsert({ id: user.id, display_name: displayName }, { onConflict: "id" })
        .select("display_name")
        .single();
      if (error) fail(error);
      return { displayName: data.display_name, email: user.email ?? null };
    },

    async deleteAccount() {
      const { error } = await client.rpc("delete_own_account");
      if (error) fail(error);
      await client.auth.signOut({ scope: "local" });
    },
  };
}
