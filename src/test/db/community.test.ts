// @vitest-environment node
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { DB_BOOT_TIMEOUT_MS, asRole, createTestDatabase, createUser } from "./harness";

/** M6 community tables, functions and triggers on real Postgres (both migrations applied). */

const ALICE = "11111111-1111-4111-8111-111111111111";
const BOB = "22222222-2222-4222-8222-222222222222";
const CAROL = "33333333-3333-4333-8333-333333333333";
const DAVE = "44444444-4444-4444-8444-444444444444";
const MOD = "55555555-5555-4555-8555-555555555555";
const PLACE = "ChIJplace1";

let db: PGlite;

const as = <T>(user: string | null, run: () => Promise<T>, role: "authenticated" | "anon" = "authenticated") =>
  asRole(db, user, run, role);
const rows = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
  (await db.query<T>(sql, params)).rows;

const report = (user: string, amenity: string, value: string, place = PLACE) =>
  as(user, () =>
    db.query("insert into public.amenity_reports (google_place_id, amenity, value) values ($1, $2, $3)", [place, amenity, value]),
  );
const review = (user: string, body = "Lovely quiet corner with good flat whites.", rating = 5, place = PLACE) =>
  as(user, () =>
    db.query<{ id: string; status: string }>(
      "insert into public.place_reviews (google_place_id, rating, body) values ($1, $2, $3) returning id, status",
      [place, rating, body],
    ),
  ).then((result) => result.rows[0] as { id: string; status: string });

beforeAll(async () => {
  db = await createTestDatabase();
}, DB_BOOT_TIMEOUT_MS);

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.exec("reset role; delete from public.moderators; delete from auth.users;");
  for (const id of [ALICE, BOB, CAROL, DAVE, MOD]) await createUser(db, id);
  await db.query("insert into public.moderators (user_id) values ($1)", [MOD]);
});

describe("amenity reports", () => {
  it("accepts valid reports, auto-approved, with server-set owner", async () => {
    await report(ALICE, "wifi", "yes");
    expect(await as(ALICE, () => rows("select user_id, amenity, value, status from public.amenity_reports"))).toEqual([
      { user_id: ALICE, amenity: "wifi", value: "yes", status: "approved" },
    ]);
  });

  it.each([
    ["wifi", "fast"],
    ["noise", "yes"],
    ["outlets", "lots"],
    ["printer", "yes"],
  ])("rejects invalid %s=%s", async (amenity, value) => {
    await expect(report(ALICE, amenity, value)).rejects.toThrow(/check constraint/);
  });

  it("prevents duplicates: one report per member, place and amenity", async () => {
    await report(ALICE, "noise", "quiet");
    await expect(report(ALICE, "noise", "loud")).rejects.toThrow(/duplicate key/);
    // ...but the member can update their own report.
    await as(ALICE, () => db.query("update public.amenity_reports set value = 'loud' where amenity = 'noise'"));
    expect(await as(ALICE, () => rows("select value from public.amenity_reports"))).toEqual([{ value: "loud" }]);
  });

  it("rejects observations outside the last year", async () => {
    await expect(
      as(ALICE, () =>
        db.query("insert into public.amenity_reports (google_place_id, amenity, value, observed_on) values ($1, 'wifi', 'yes', current_date - 400)", [PLACE]),
      ),
    ).rejects.toThrow(/within the last year/);
    await expect(
      as(ALICE, () =>
        db.query("insert into public.amenity_reports (google_place_id, amenity, value, observed_on) values ($1, 'wifi', 'yes', current_date + 5)", [PLACE]),
      ),
    ).rejects.toThrow(/within the last year/);
  });

  it("does not let members set status or user_id", async () => {
    await expect(
      as(ALICE, () => db.query("insert into public.amenity_reports (google_place_id, amenity, value, status) values ($1, 'wifi', 'yes', 'approved')", [PLACE])),
    ).rejects.toThrow(/permission denied/);
    await report(ALICE, "wifi", "yes");
    await expect(as(ALICE, () => db.query("update public.amenity_reports set status = 'approved'"))).rejects.toThrow(/permission denied/);
    await expect(as(ALICE, () => db.query("update public.amenity_reports set user_id = $1", [BOB]))).rejects.toThrow(/permission denied/);
  });

  it("isolates rows: others can't read, change or delete them", async () => {
    await report(ALICE, "wifi", "yes");
    expect(await as(BOB, () => rows("select * from public.amenity_reports"))).toEqual([]);
    expect((await as(BOB, () => db.query("update public.amenity_reports set value = 'no'"))).affectedRows).toBe(0);
    expect((await as(BOB, () => db.query("delete from public.amenity_reports"))).affectedRows).toBe(0);
    await expect(as(null, () => rows("select * from public.amenity_reports"), "anon")).rejects.toThrow(/permission denied/);
    await expect(as(ALICE, () => db.exec("truncate public.amenity_reports"))).rejects.toThrow(/permission denied/);
  });

  it("caps submissions per day", async () => {
    // 50/day cap: insert 50 distinct (place, amenity) pairs, then one more.
    await as(ALICE, () =>
      db.query(
        "insert into public.amenity_reports (google_place_id, amenity, value) select 'ChIJcap' || n, 'wifi', 'yes' from generate_series(1, 50) n",
      ),
    );
    await expect(report(ALICE, "wifi", "yes", "ChIJcap51")).rejects.toThrow(/Daily limit of 50/);
  });
});

describe("public read functions", () => {
  beforeEach(async () => {
    await report(ALICE, "wifi", "yes");
    await report(BOB, "wifi", "no");
    await as(BOB, () => db.query("insert into public.visit_feedback (google_place_id) values ($1)", [PLACE]));
  });

  it("returns approved reports to guests, with visit confirmation and no identities", async () => {
    const result = await as(null, () => rows("select * from public.community_amenity_reports(array[$1])", [PLACE]), "anon");
    expect(result).toHaveLength(2);
    expect(Object.keys(result[0] ?? {}).sort()).toEqual(["amenity", "confirmed_visit", "google_place_id", "observed_on", "value"]);
    expect(result.map((row) => [row.value, row.confirmed_visit]).sort()).toEqual([
      ["no", true],
      ["yes", false],
    ]);
  });

  it("excludes non-approved content", async () => {
    await db.query("update public.amenity_reports set status = 'hidden' where user_id = $1", [BOB]);
    const result = await as(null, () => rows("select value from public.community_amenity_reports(array[$1])", [PLACE]), "anon");
    expect(result).toEqual([{ value: "yes" }]);
  });

  it("caps the number of places per request", async () => {
    const ids = Array.from({ length: 51 }, (_, index) => `ChIJp${index}`);
    await expect(as(null, () => rows("select * from public.community_amenity_reports($1)", [ids]), "anon")).rejects.toThrow(/At most 50/);
  });

  it("returns approved reviews with vote tallies and is_own, but no author", async () => {
    const aliceReview = await review(ALICE);
    await as(BOB, () => db.query("insert into public.review_votes (review_id, helpful) values ($1, true)", [aliceReview.id]));
    await as(CAROL, () => db.query("insert into public.review_votes (review_id, helpful) values ($1, false)", [aliceReview.id]));

    const asGuest = await as(null, () => rows("select * from public.community_reviews($1)", [PLACE]), "anon");
    expect(asGuest).toHaveLength(1);
    expect(asGuest[0]).toMatchObject({ rating: 5, helpful_count: 1, not_helpful_count: 1, is_own: false, confirmed_visit: false });
    expect(Object.keys(asGuest[0] ?? {})).not.toContain("user_id");

    const asAuthor = await as(ALICE, () => rows("select is_own from public.community_reviews($1)", [PLACE]));
    expect(asAuthor).toEqual([{ is_own: true }]);
  });
});

describe("reviews", () => {
  it("enforces rating and length rules, one review per place", async () => {
    await expect(review(ALICE, "too short")).rejects.toThrow(/check constraint/);
    await expect(review(ALICE, "Fine body text that is long enough.", 6)).rejects.toThrow(/check constraint/);
    await review(ALICE);
    await expect(review(ALICE)).rejects.toThrow(/duplicate key/);
  });

  it.each([
    ["a link", "Great place, see https://spam.example for coupons!"],
    ["an email", "Lovely staff, email me at someone@example.com anytime."],
    ["a local phone number", "Good coffee. Call the owner on 012 345 678 for bookings."],
    ["an international number", "Book a table: +855 12 345 678, they reply quickly."],
  ])("holds reviews containing %s for moderation", async (_label, body) => {
    expect((await review(ALICE, body)).status).toBe("pending");
  });

  it.each([
    ["prices", "A latte is $3.50 and the cake is 12,000 riel. Worth it."],
    ["opening hours", "Open 7.00 - 21.00 every day, quiet mornings before 9."],
  ])("does not hold ordinary text with %s", async (_label, body) => {
    expect((await review(ALICE, body)).status).toBe("approved");
  });

  it("caps reviews per day", async () => {
    await as(ALICE, () =>
      db.query(
        "insert into public.place_reviews (google_place_id, rating, body) select 'ChIJr' || n, 4, 'A perfectly reasonable review text.' from generate_series(1, 10) n",
      ),
    );
    await expect(review(ALICE, "Another perfectly reasonable review.", 4, "ChIJr11")).rejects.toThrow(/Daily limit of 10/);
  });
});

describe("voting", () => {
  it("allows one vote per member, changeable, on others' approved reviews only", async () => {
    const aliceReview = await review(ALICE);
    await as(BOB, () => db.query("insert into public.review_votes (review_id, helpful) values ($1, true)", [aliceReview.id]));
    await expect(as(BOB, () => db.query("insert into public.review_votes (review_id, helpful) values ($1, false)", [aliceReview.id]))).rejects.toThrow(/duplicate key/);
    await as(BOB, () => db.query("update public.review_votes set helpful = false where review_id = $1", [aliceReview.id]));

    await expect(as(ALICE, () => db.query("insert into public.review_votes (review_id, helpful) values ($1, true)", [aliceReview.id]))).rejects.toThrow(/own review/);

    const pending = await review(CAROL, "Visit https://example.com for a much better coffee deal.");
    await expect(as(BOB, () => db.query("insert into public.review_votes (review_id, helpful) values ($1, true)", [pending.id]))).rejects.toThrow(/not available/);
  });

  it("hides others' votes", async () => {
    const aliceReview = await review(ALICE);
    await as(BOB, () => db.query("insert into public.review_votes (review_id, helpful) values ($1, true)", [aliceReview.id]));
    expect(await as(CAROL, () => rows("select * from public.review_votes"))).toEqual([]);
  });
});

describe("flags and moderation", () => {
  it("hides content after three distinct flags, and not before", async () => {
    const target = await review(ALICE);
    const flag = (user: string) =>
      as(user, () => db.query("insert into public.content_flags (target_type, target_id, reason) values ('review', $1, 'offensive')", [target.id]));
    await flag(BOB);
    await flag(CAROL);
    expect(await rows("select status from public.place_reviews where id = $1", [target.id])).toEqual([{ status: "approved" }]);
    await expect(flag(BOB)).rejects.toThrow(/duplicate key/);
    await flag(DAVE);
    expect(await rows("select status from public.place_reviews where id = $1", [target.id])).toEqual([{ status: "hidden" }]);
    expect(await as(null, () => rows("select * from public.community_reviews($1)", [PLACE]), "anon")).toEqual([]);
  });

  it("forbids flagging your own content", async () => {
    const target = await review(ALICE);
    await expect(
      as(ALICE, () => db.query("insert into public.content_flags (target_type, target_id, reason) values ('review', $1, 'spam')", [target.id])),
    ).rejects.toThrow(/own content/);
  });

  it("editing hidden or rejected content sends it back to moderation, never straight to approved", async () => {
    const target = await review(ALICE);
    await db.query("update public.place_reviews set status = 'rejected' where id = $1", [target.id]);
    await as(ALICE, () => db.query("update public.place_reviews set body = 'Edited to be a perfectly normal review.' where id = $1", [target.id]));
    expect(await rows("select status from public.place_reviews where id = $1", [target.id])).toEqual([{ status: "pending" }]);
  });

  it("lets moderators see the queue and approve (clearing flags) or reject, with an audit trail", async () => {
    const target = await review(ALICE);
    for (const user of [BOB, CAROL, DAVE]) {
      await as(user, () => db.query("insert into public.content_flags (target_type, target_id, reason) values ('review', $1, 'spam')", [target.id]));
    }
    const queue = await as(MOD, () => rows<{ target_id: string; flag_count: number; flag_reasons: string[] }>("select * from public.moderation_queue()"));
    expect(queue).toEqual([expect.objectContaining({ target_id: target.id, flag_count: 3, flag_reasons: ["spam"] })]);

    await as(MOD, () => db.query("select public.moderate_content('review', $1, 'approved')", [target.id]));
    expect(await rows("select status from public.place_reviews where id = $1", [target.id])).toEqual([{ status: "approved" }]);
    expect(await rows("select count(*)::int as n from public.content_flags where target_id = $1", [target.id])).toEqual([{ n: 0 }]);

    await as(MOD, () => db.query("select public.moderate_content('review', $1, 'rejected')", [target.id]));
    expect(await rows("select status from public.place_reviews where id = $1", [target.id])).toEqual([{ status: "rejected" }]);
    expect(await rows("select moderator_id, decision from public.moderation_events order by created_at")).toEqual([
      { moderator_id: MOD, decision: "approved" },
      { moderator_id: MOD, decision: "rejected" },
    ]);
  });

  it("refuses moderation to non-moderators and guests", async () => {
    const target = await review(ALICE);
    await expect(as(BOB, () => rows("select * from public.moderation_queue()"))).rejects.toThrow(/Moderators only/);
    await expect(as(BOB, () => db.query("select public.moderate_content('review', $1, 'rejected')", [target.id]))).rejects.toThrow(/Moderators only/);
    await expect(as(null, () => rows("select * from public.moderation_queue()"), "anon")).rejects.toThrow(/permission denied/);
    expect(await as(BOB, () => rows("select public.am_i_moderator() as m"))).toEqual([{ m: false }]);
    expect(await as(MOD, () => rows("select public.am_i_moderator() as m"))).toEqual([{ m: true }]);
  });

  it("keeps moderators and the audit log out of members' reach", async () => {
    await expect(as(BOB, () => rows("select * from public.moderators"))).rejects.toThrow(/permission denied/);
    await expect(as(BOB, () => db.query("insert into public.moderators (user_id) values ($1)", [BOB]))).rejects.toThrow(/permission denied/);
    await expect(as(BOB, () => rows("select * from public.moderation_events"))).rejects.toThrow(/permission denied/);
  });

  it("keeps internal helpers uncallable", async () => {
    await expect(as(BOB, () => rows("select private.is_moderator()"))).rejects.toThrow(/permission denied/);
  });
});

describe("account deletion", () => {
  it("removes a member's contributions, votes and flags (and flags on their content)", async () => {
    await report(ALICE, "wifi", "yes");
    const aliceReview = await review(ALICE);
    const bobReview = await review(BOB);
    await as(ALICE, () => db.query("insert into public.review_votes (review_id, helpful) values ($1, true)", [bobReview.id]));
    await as(BOB, () => db.query("insert into public.content_flags (target_type, target_id, reason) values ('review', $1, 'spam')", [aliceReview.id]));

    await as(ALICE, () => db.query("select public.delete_own_account()"));

    expect(await rows("select count(*)::int as n from public.amenity_reports")).toEqual([{ n: 0 }]);
    expect(await rows("select count(*)::int as n from public.place_reviews")).toEqual([{ n: 1 }]);
    expect(await rows("select count(*)::int as n from public.review_votes")).toEqual([{ n: 0 }]);
    expect(await rows("select count(*)::int as n from public.content_flags")).toEqual([{ n: 0 }]);
  });
});

/**
 * supabase-js `upsert()` reaches Postgres (via PostgREST) as
 * `insert … on conflict (…) do update set <every column in the payload>`.
 * UPDATE privilege is checked on all SET columns, including the conflict keys,
 * even when no conflict happens. These mirror the store's calls exactly.
 */
describe("upserts as sent by supabase-js (regression: 'That action isn't allowed')", () => {
  const upsertReport = (user: string, amenity: string, value: string, place = PLACE) =>
    as(user, () =>
      db.query(
        `insert into public.amenity_reports (google_place_id, amenity, value, observed_on)
         values ($1, $2, $3, current_date)
         on conflict (user_id, google_place_id, amenity) do update set
           google_place_id = excluded.google_place_id, amenity = excluded.amenity,
           value = excluded.value, observed_on = excluded.observed_on
         returning status`,
        [place, amenity, value],
      ),
    );
  const upsertReview = (user: string, rating: number, body: string, place = PLACE) =>
    as(user, () =>
      db.query<{ id: string; status: string }>(
        `insert into public.place_reviews (google_place_id, rating, body) values ($1, $2, $3)
         on conflict (user_id, google_place_id) do update set
           google_place_id = excluded.google_place_id, rating = excluded.rating, body = excluded.body
         returning id, status`,
        [place, rating, body],
      ),
    ).then((result) => result.rows[0]!);
  const upsertVote = (user: string, reviewId: string, helpful: boolean) =>
    as(user, () =>
      db.query(
        `insert into public.review_votes (review_id, helpful) values ($1, $2)
         on conflict (review_id, user_id) do update set review_id = excluded.review_id, helpful = excluded.helpful`,
        [reviewId, helpful],
      ),
    );

  it("creates and then updates an amenity report", async () => {
    await upsertReport(ALICE, "wifi", "yes");
    await upsertReport(ALICE, "wifi", "no");
    expect(await as(ALICE, () => rows("select amenity, value, status from public.amenity_reports"))).toEqual([
      { amenity: "wifi", value: "no", status: "approved" },
    ]);
  });

  it("creates and edits a review; contact details still go to moderation", async () => {
    expect((await upsertReview(ALICE, 4, "Good espresso and plenty of tables upstairs.")).status).toBe("approved");
    expect((await upsertReview(ALICE, 3, "Call 012 345 678 to reserve the upstairs room.")).status).toBe("pending");
    expect((await upsertReview(BOB, 4, "Call 012 345 678 to reserve the upstairs room.")).status).toBe("pending");
  });

  it("creates and changes a vote", async () => {
    const { id } = await upsertReview(ALICE, 5, "Bright room, friendly staff, fast Wi-Fi.");
    await upsertVote(BOB, id, true);
    await upsertVote(BOB, id, false);
    expect(await as(BOB, () => rows("select helpful from public.review_votes"))).toEqual([{ helpful: false }]);
  });

  it("still never lets a member move their content to another place, amenity or review", async () => {
    await upsertReport(ALICE, "wifi", "yes");
    const { id } = await upsertReview(ALICE, 5, "Bright room, friendly staff, fast Wi-Fi.");
    const other = await upsertReview(CAROL, 4, "Nice terrace and decent cold brew here.", "ChIJplace2");
    await upsertVote(BOB, id, true);
    await expect(as(ALICE, () => db.query("update public.amenity_reports set google_place_id = 'ChIJother'"))).rejects.toThrow();
    await expect(as(ALICE, () => db.query("update public.amenity_reports set amenity = 'noise', value = 'quiet'"))).rejects.toThrow();
    await expect(as(ALICE, () => db.query("update public.place_reviews set google_place_id = 'ChIJother'"))).rejects.toThrow();
    await expect(as(BOB, () => db.query("update public.review_votes set review_id = $1", [other.id]))).rejects.toThrow();
    await expect(as(ALICE, () => db.query("update public.place_reviews set status = 'approved'"))).rejects.toThrow(/permission denied/);
  });
});
