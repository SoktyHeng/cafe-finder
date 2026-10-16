/**
 * Types for the M5 schema (supabase/migrations/20261016000000_m5_profiles_favorites.sql).
 * Hand-written to match the migration; regenerate with
 *   pnpm dlx supabase@2.119.0 gen types typescript --linked > src/lib/supabase/database.types.ts
 * once a project is linked, and keep them in sync with every migration.
 */
type Timestamp = string;

type Table<Row, Insert, Update = Partial<Insert>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type ProfileRow = {
  id: string;
  display_name: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
};

export type UserPreferencesRow = {
  user_id: string;
  default_purpose: "work" | "relax" | "friends" | "date";
  default_radius_m: number;
  min_rating: number | null;
  open_now_only: boolean;
  budget_tier: "any" | "under_5" | "5_to_10" | "over_10";
  prefer_quiet: boolean;
  prefer_wifi: boolean;
  updated_at: Timestamp;
};

export type FavoritePlaceRow = {
  id: string;
  user_id: string;
  google_place_id: string;
  notes: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
};

export type VisitFeedbackRow = {
  id: string;
  user_id: string;
  google_place_id: string;
  visit_date: string | null;
  liked: boolean | null;
  comment: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
};

export type Database = {
  public: {
    Tables: {
      profiles: Table<ProfileRow, { id: string; display_name?: string | null }>;
      user_preferences: Table<UserPreferencesRow, Partial<UserPreferencesRow> & { user_id: string }>;
      favorite_places: Table<
        FavoritePlaceRow,
        { google_place_id: string; notes?: string | null; user_id?: string }
      >;
      visit_feedback: Table<
        VisitFeedbackRow,
        {
          google_place_id: string;
          visit_date?: string | null;
          liked?: boolean | null;
          comment?: string | null;
          user_id?: string;
        }
      >;
    };
    Views: Record<string, never>;
    Functions: {
      delete_own_account: { Args: Record<string, never>; Returns: undefined };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
