import "server-only";

import type { PostgrestError } from "@supabase/supabase-js";

import type { AppSupabaseClient } from "@/lib/supabase/types";

import { isCommunityAmenity, type CommunityReport } from "./schemas";
import { CommunityError, type CommunityMemberStore, type CommunityReader } from "./store";

/** Maps the M6 migration's raised errors and constraint codes to typed errors. */
export function communityErrorFrom(error: Pick<PostgrestError, "code" | "message">): CommunityError {
  const { code, message } = error;
  if (/Daily limit|Row limit/.test(message)) return new CommunityError("limit");
  if (code === "23505") return new CommunityError("duplicate");
  if (/own review|own content|not available|Moderators only/.test(message) || code === "42501") {
    return new CommunityError("not_allowed");
  }
  if (code === "P0002" || /not found/i.test(message)) return new CommunityError("not_found");
  if (code === "23514" || code === "22P02" || code === "22023" || /within the last year/.test(message)) {
    return new CommunityError("invalid");
  }
  return new CommunityError("unavailable");
}

function fail(error: PostgrestError): never {
  throw communityErrorFrom(error);
}

/**
 * Reads approved content through the anonymized SQL functions. Pass the
 * member's session client when signed in (so `is_own` is computed), or the
 * session-less public client for guests.
 */
export function createSupabaseCommunityReader(client: AppSupabaseClient): CommunityReader {
  return {
    async amenityReports(placeIds) {
      if (placeIds.length === 0) return [];
      const { data, error } = await client.rpc("community_amenity_reports", { place_ids: [...placeIds] });
      if (error) fail(error);
      return data.flatMap((row): CommunityReport[] =>
        isCommunityAmenity(row.amenity)
          ? [
              {
                placeId: row.google_place_id,
                amenity: row.amenity,
                value: row.value,
                observedOn: row.observed_on,
                confirmedVisit: row.confirmed_visit,
              },
            ]
          : [],
      );
    },

    async reviews(placeId) {
      const { data, error } = await client.rpc("community_reviews", { place_id: placeId, max_results: 20 });
      if (error) fail(error);
      return data.map((row) => ({
        id: row.id,
        rating: row.rating,
        body: row.body,
        createdAt: row.created_at,
        edited: Date.parse(row.updated_at) - Date.parse(row.created_at) > 60_000,
        confirmedVisit: row.confirmed_visit,
        helpfulCount: row.helpful_count,
        notHelpfulCount: row.not_helpful_count,
        isOwn: row.is_own,
      }));
    },
  };
}

export function createSupabaseCommunityMemberStore(client: AppSupabaseClient): CommunityMemberStore {
  return {
    async myContributions(placeId) {
      const [reports, review, votes, flags] = await Promise.all([
        client.from("amenity_reports").select("id, amenity, value, observed_on, status").eq("google_place_id", placeId),
        client.from("place_reviews").select("id, rating, body, status").eq("google_place_id", placeId).maybeSingle(),
        client.from("review_votes").select("review_id, helpful").limit(500),
        client.from("content_flags").select("target_id").eq("target_type", "review").limit(1000),
      ]);
      for (const result of [reports, review, votes, flags]) if (result.error) fail(result.error);
      return {
        reports: (reports.data ?? []).map((row) => ({
          id: row.id,
          amenity: row.amenity,
          value: row.value,
          observedOn: row.observed_on,
          status: row.status,
        })),
        review: review.data
          ? { id: review.data.id, rating: review.data.rating, body: review.data.body, status: review.data.status }
          : null,
        votes: Object.fromEntries((votes.data ?? []).map((row) => [row.review_id, row.helpful])),
        flaggedReviewIds: (flags.data ?? []).map((row) => row.target_id),
      };
    },

    async submitAmenities(placeId, input) {
      const { error } = await client.from("amenity_reports").upsert(
        input.answers.map((answer) => ({
          google_place_id: placeId,
          amenity: answer.amenity,
          value: answer.value,
          observed_on: input.observedOn,
        })),
        { onConflict: "user_id,google_place_id,amenity" },
      );
      if (error) fail(error);
    },

    async removeAmenity(placeId, amenity) {
      const { error } = await client.from("amenity_reports").delete().eq("google_place_id", placeId).eq("amenity", amenity);
      if (error) fail(error);
    },

    async saveReview(placeId, input) {
      const { data, error } = await client
        .from("place_reviews")
        .upsert({ google_place_id: placeId, rating: input.rating, body: input.body }, { onConflict: "user_id,google_place_id" })
        .select("status")
        .single();
      if (error) fail(error);
      return data.status;
    },

    async deleteReview(placeId) {
      const { error } = await client.from("place_reviews").delete().eq("google_place_id", placeId);
      if (error) fail(error);
    },

    async vote(reviewId, helpful) {
      const { error } = await client
        .from("review_votes")
        .upsert({ review_id: reviewId, helpful }, { onConflict: "review_id,user_id" });
      if (error) fail(error);
    },

    async removeVote(reviewId) {
      const { error } = await client.from("review_votes").delete().eq("review_id", reviewId);
      if (error) fail(error);
    },

    async flag(input) {
      const { error } = await client
        .from("content_flags")
        .insert({ target_type: input.targetType, target_id: input.targetId, reason: input.reason });
      if (error) fail(error);
    },

    async isModerator() {
      const { data, error } = await client.rpc("am_i_moderator");
      if (error) fail(error);
      return data === true;
    },

    async moderationQueue() {
      const { data, error } = await client.rpc("moderation_queue");
      if (error) fail(error);
      return data.map((row) => ({
        targetType: row.target_type,
        targetId: row.target_id,
        placeId: row.google_place_id,
        status: row.status,
        amenity: row.amenity,
        value: row.value,
        rating: row.rating,
        body: row.body,
        flagCount: row.flag_count,
        flagReasons: row.flag_reasons,
        updatedAt: row.updated_at,
      }));
    },

    async moderate({ targetType, targetId, decision }) {
      const { error } = await client.rpc("moderate_content", {
        target_type: targetType,
        target_id: targetId,
        decision,
      });
      if (error) fail(error);
    },
  };
}
