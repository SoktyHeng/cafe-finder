import { describe, expect, it, vi } from "vitest";

import type { AppSupabaseClient } from "@/lib/supabase/types";

import { communityErrorFrom, createSupabaseCommunityMemberStore, createSupabaseCommunityReader } from "./supabase-store";

describe("communityErrorFrom (messages raised by the M6 migration)", () => {
  it.each([
    [{ code: "23514", message: "Daily limit of 10 reached for place_reviews" }, "limit"],
    [{ code: "23514", message: "Row limit of 500 reached for place_reviews" }, "limit"],
    [{ code: "23505", message: "duplicate key value violates unique constraint" }, "duplicate"],
    [{ code: "23514", message: "You cannot vote on your own review" }, "not_allowed"],
    [{ code: "23514", message: "You cannot flag your own content" }, "not_allowed"],
    [{ code: "23514", message: "Content not available for flagging" }, "not_allowed"],
    [{ code: "42501", message: "Moderators only" }, "not_allowed"],
    [{ code: "P0002", message: "Content not found" }, "not_found"],
    [{ code: "23514", message: "new row violates check constraint" }, "invalid"],
    [{ code: "23514", message: "observed_on must be within the last year" }, "invalid"],
    [{ code: "PGRST301", message: "JWT expired" }, "unavailable"],
  ])("%o → %s", (error, kind) => {
    expect(communityErrorFrom(error).kind).toBe(kind);
  });
});

describe("community reader", () => {
  const rpcClient = (data: unknown) => {
    const rpc = vi.fn(async () => ({ data, error: null }));
    return { client: { rpc } as unknown as AppSupabaseClient, rpc };
  };

  it("maps anonymized report rows and drops unknown amenities", async () => {
    const { client, rpc } = rpcClient([
      { google_place_id: "ChIJa", amenity: "wifi", value: "yes", observed_on: "2026-10-01", confirmed_visit: true },
      { google_place_id: "ChIJa", amenity: "printer", value: "yes", observed_on: "2026-10-01", confirmed_visit: false },
    ]);
    expect(await createSupabaseCommunityReader(client).amenityReports(["ChIJa"])).toEqual([
      { placeId: "ChIJa", amenity: "wifi", value: "yes", observedOn: "2026-10-01", confirmedVisit: true },
    ]);
    expect(rpc).toHaveBeenCalledWith("community_amenity_reports", { place_ids: ["ChIJa"] });
  });

  it("skips the call entirely for no places", async () => {
    const { client, rpc } = rpcClient([]);
    expect(await createSupabaseCommunityReader(client).amenityReports([])).toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("maps reviews and marks edits after the first minute", async () => {
    const { client } = rpcClient([
      {
        id: "7f4b2c1e-9a3d-4e5f-8b6c-1d2e3f4a5b6c",
        rating: 4,
        body: "Nice.",
        created_at: "2026-10-01T10:00:00Z",
        updated_at: "2026-10-02T10:00:00Z",
        confirmed_visit: true,
        helpful_count: 3,
        not_helpful_count: 1,
        is_own: false,
      },
    ]);
    const [review] = await createSupabaseCommunityReader(client).reviews("ChIJa");
    expect(review).toMatchObject({ rating: 4, edited: true, confirmedVisit: true, helpfulCount: 3, isOwn: false });
  });
});

describe("community member store", () => {
  it("upserts amenity answers on (user, place, amenity) without sending status or user_id", async () => {
    const upsert = vi.fn(async () => ({ error: null }));
    const client = { from: vi.fn(() => ({ upsert })) } as unknown as AppSupabaseClient;
    await createSupabaseCommunityMemberStore(client).submitAmenities("ChIJa", {
      answers: [{ amenity: "wifi", value: "yes" }],
      observedOn: "2026-10-18",
    });
    expect(upsert).toHaveBeenCalledWith(
      [{ google_place_id: "ChIJa", amenity: "wifi", value: "yes", observed_on: "2026-10-18" }],
      { onConflict: "user_id,google_place_id,amenity" },
    );
  });
});
