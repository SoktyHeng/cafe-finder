import type {
  AmenityReportInput,
  CommunityAmenity,
  CommunityReport,
  CommunityReview,
  ContentStatus,
  FlagInput,
  ModerationDecision,
  MyContributions,
  ReviewInput,
} from "./schemas";

/** Approved, anonymized community content. Works for guests. */
export interface CommunityReader {
  amenityReports(placeIds: readonly string[]): Promise<CommunityReport[]>;
  reviews(placeId: string): Promise<CommunityReview[]>;
}

export type ModerationItem = {
  targetType: "amenity_report" | "review";
  targetId: string;
  placeId: string;
  status: ContentStatus;
  amenity: string | null;
  value: string | null;
  rating: number | null;
  body: string | null;
  flagCount: number;
  flagReasons: string[];
  updatedAt: string;
};

/**
 * Contributions by ONE signed-in member, acting as that member (RLS-scoped).
 * Never takes a user ID from the caller.
 */
export interface CommunityMemberStore {
  myContributions(placeId: string): Promise<MyContributions>;
  submitAmenities(placeId: string, input: AmenityReportInput): Promise<void>;
  removeAmenity(placeId: string, amenity: CommunityAmenity): Promise<void>;
  /** Returns the resulting moderation status (e.g. "pending" if held for review). */
  saveReview(placeId: string, input: ReviewInput): Promise<ContentStatus>;
  deleteReview(placeId: string): Promise<void>;
  vote(reviewId: string, helpful: boolean): Promise<void>;
  removeVote(reviewId: string): Promise<void>;
  flag(input: FlagInput): Promise<void>;
  isModerator(): Promise<boolean>;
  moderationQueue(): Promise<ModerationItem[]>;
  moderate(decision: ModerationDecision): Promise<void>;
}

export type CommunityErrorKind =
  /** Daily or total contribution cap reached. */
  | "limit"
  /** Already done (e.g. flagged twice). */
  | "duplicate"
  /** Not permitted on this item (own review, unavailable content, not a moderator). */
  | "not_allowed"
  | "not_found"
  | "invalid"
  | "unavailable";

export class CommunityError extends Error {
  constructor(readonly kind: CommunityErrorKind) {
    super(`Community operation failed: ${kind}`);
    this.name = "CommunityError";
  }
}
