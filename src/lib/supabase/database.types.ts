/**
 * Types for the M5 and M6 schema (supabase/migrations/).
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

export type ContentStatusColumn = "approved" | "pending" | "hidden" | "rejected";

export type AmenityReportRow = {
  id: string;
  user_id: string;
  google_place_id: string;
  amenity: "wifi" | "outlets" | "noise" | "seating" | "laptop_friendly";
  value: string;
  observed_on: string;
  status: ContentStatusColumn;
  created_at: Timestamp;
  updated_at: Timestamp;
};

export type PlaceReviewRow = {
  id: string;
  user_id: string;
  google_place_id: string;
  rating: number;
  body: string;
  status: ContentStatusColumn;
  created_at: Timestamp;
  updated_at: Timestamp;
};

export type ReviewVoteRow = { review_id: string; user_id: string; helpful: boolean; created_at: Timestamp };

export type ContentFlagRow = {
  id: string;
  target_type: "amenity_report" | "review";
  target_id: string;
  reporter_user_id: string;
  reason: "spam" | "offensive" | "incorrect" | "personal_info" | "other";
  created_at: Timestamp;
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
      // M6: members may write only these columns (status/user_id are server-controlled).
      amenity_reports: Table<
        AmenityReportRow,
        Pick<AmenityReportRow, "google_place_id" | "amenity" | "value"> & { observed_on?: string },
        Partial<Pick<AmenityReportRow, "value" | "observed_on">>
      >;
      place_reviews: Table<
        PlaceReviewRow,
        Pick<PlaceReviewRow, "google_place_id" | "rating" | "body">,
        Partial<Pick<PlaceReviewRow, "rating" | "body">>
      >;
      review_votes: Table<ReviewVoteRow, Pick<ReviewVoteRow, "review_id" | "helpful">, Partial<Pick<ReviewVoteRow, "helpful">>>;
      content_flags: Table<ContentFlagRow, Pick<ContentFlagRow, "target_type" | "target_id" | "reason">, never>;
    };
    Views: Record<string, never>;
    Functions: {
      delete_own_account: { Args: Record<string, never>; Returns: undefined };
      community_amenity_reports: {
        Args: { place_ids: string[] };
        Returns: {
          google_place_id: string;
          amenity: AmenityReportRow["amenity"];
          value: string;
          observed_on: string;
          confirmed_visit: boolean;
        }[];
      };
      community_reviews: {
        Args: { place_id: string; max_results?: number };
        Returns: {
          id: string;
          rating: number;
          body: string;
          created_at: Timestamp;
          updated_at: Timestamp;
          confirmed_visit: boolean;
          helpful_count: number;
          not_helpful_count: number;
          is_own: boolean;
        }[];
      };
      am_i_moderator: { Args: Record<string, never>; Returns: boolean };
      moderation_queue: {
        Args: Record<string, never>;
        Returns: {
          target_type: "amenity_report" | "review";
          target_id: string;
          google_place_id: string;
          status: ContentStatusColumn;
          amenity: string | null;
          value: string | null;
          rating: number | null;
          body: string | null;
          flag_count: number;
          flag_reasons: string[];
          updated_at: Timestamp;
        }[];
      };
      moderate_content: {
        Args: { target_type: "amenity_report" | "review"; target_id: string; decision: "approved" | "rejected" };
        Returns: undefined;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
