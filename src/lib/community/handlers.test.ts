import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiErrorBodySchema } from "@/lib/security/api-error";
import { FixedWindowRateLimiter } from "@/lib/security/rate-limit";

import { createCommunityHandlers, type CommunityContext } from "./handlers";
import { communityPlaceResponseSchema, type CommunityReport } from "./schemas";
import { CommunityError, type CommunityMemberStore, type CommunityReader } from "./store";

const ORIGIN = "https://cafes.example";
const PLACE = "ChIJplace1";
const REVIEW_ID = "7f4b2c1e-9a3d-4e5f-8b6c-1d2e3f4a5b6c";
const NOW = new Date("2026-10-19T00:00:00Z");

const reports: CommunityReport[] = [
  { placeId: PLACE, amenity: "wifi", value: "yes", observedOn: "2026-10-10", confirmedVisit: true },
  { placeId: PLACE, amenity: "wifi", value: "yes", observedOn: "2026-10-01", confirmedVisit: false },
];

function fakeReader(): CommunityReader {
  return { amenityReports: vi.fn(async () => reports), reviews: vi.fn(async () => []) };
}

function fakeMember(): CommunityMemberStore {
  return {
    myContributions: vi.fn(async () => ({ reports: [], review: null, votes: {}, flaggedReviewIds: [] })),
    submitAmenities: vi.fn(async () => {}),
    removeAmenity: vi.fn(async () => {}),
    saveReview: vi.fn(async () => "approved" as const),
    deleteReview: vi.fn(async () => {}),
    vote: vi.fn(async () => {}),
    removeVote: vi.fn(async () => {}),
    flag: vi.fn(async () => {}),
    isModerator: vi.fn(async () => false),
    moderationQueue: vi.fn(async () => []),
    moderate: vi.fn(async () => {}),
  };
}

let reader: CommunityReader;
let member: CommunityMemberStore;
let context: CommunityContext;

function handlers(limits = { reads: 100, writes: 100 }) {
  return createCommunityHandlers({
    getContext: async () => context,
    clientKey: () => "client-hash",
    now: () => NOW,
    readLimiter: new FixedWindowRateLimiter({ limit: limits.reads, windowMs: 60_000 }),
    writeLimiter: new FixedWindowRateLimiter({ limit: limits.writes, windowMs: 60_000 }),
  });
}

const request = (method: string, path: string, body?: unknown, origin: string | null = ORIGIN) =>
  new Request(`${ORIGIN}${path}`, {
    method,
    headers: { ...(origin && { Origin: origin }), ...(body !== undefined && { "Content-Type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const errorOf = async (response: Response) => apiErrorBodySchema.parse(await response.json()).error;

beforeEach(() => {
  reader = fakeReader();
  member = fakeMember();
  context = { reader, member: { userId: "user-a", store: member } };
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
});

describe("GET community for a place", () => {
  it("returns aggregated summaries and reviews to guests, with no member data", async () => {
    context = { reader, member: null };
    const response = await handlers().place(request("GET", `/api/community/${PLACE}`, undefined, null), PLACE);
    expect(response.status).toBe(200);
    const body = communityPlaceResponseSchema.parse(await response.json());
    expect(body.mine).toBeNull();
    expect(body.amenities).toEqual([
      expect.objectContaining({ amenity: "wifi", consensus: "yes", reportCount: 2, confirmedVisitCount: 1, sufficient: true }),
    ]);
    expect(reader.amenityReports).toHaveBeenCalledWith([PLACE]);
  });

  it("includes the member's own contributions when signed in", async () => {
    const body = communityPlaceResponseSchema.parse(await (await handlers().place(request("GET", "/x"), PLACE)).json());
    expect(body.mine).toEqual({ reports: [], review: null, votes: {}, flaggedReviewIds: [] });
  });

  it("validates the place ID and reports unconfigured sites", async () => {
    expect((await handlers().place(request("GET", "/x"), "../etc")).status).toBe(400);
    context = "unconfigured";
    expect((await handlers().place(request("GET", "/x"), PLACE)).status).toBe(503);
  });

  it("rate limits guests by client key", async () => {
    context = { reader, member: null };
    const h = handlers({ reads: 1, writes: 100 });
    expect((await h.place(request("GET", "/x"), PLACE)).status).toBe(200);
    const limited = await h.place(request("GET", "/x"), PLACE);
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).not.toBeNull();
  });

  it("never leaks backend error details", async () => {
    reader.amenityReports = vi.fn(async () => {
      throw new Error("relation amenity_reports at 10.0.0.9");
    });
    const response = await handlers().place(request("GET", "/x"), PLACE);
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("10.0.0.9");
  });
});

describe("member contributions", () => {
  it("submits amenity answers after validating them", async () => {
    const h = handlers();
    const ok = await h.submitAmenities(
      request("PUT", "/x", { answers: [{ amenity: "wifi", value: "yes" }, { amenity: "noise", value: "quiet" }], observedOn: "2026-10-18" }),
      { placeId: PLACE },
    );
    expect(ok.status).toBe(204);
    expect(member.submitAmenities).toHaveBeenCalledWith(PLACE, {
      answers: [{ amenity: "wifi", value: "yes" }, { amenity: "noise", value: "quiet" }],
      observedOn: "2026-10-18",
    });

    for (const body of [
      { answers: [{ amenity: "wifi", value: "fast" }], observedOn: "2026-10-18" },
      { answers: [{ amenity: "wifi", value: "yes" }, { amenity: "wifi", value: "no" }], observedOn: "2026-10-18" },
      { answers: [], observedOn: "2026-10-18" },
      { answers: [{ amenity: "wifi", value: "yes" }], observedOn: "yesterday" },
      { answers: [{ amenity: "wifi", value: "yes" }], observedOn: "2026-10-18", status: "approved" },
    ]) {
      expect((await h.submitAmenities(request("PUT", "/x", body), { placeId: PLACE })).status).toBe(400);
    }
  });

  it("saves reviews, trimming control characters, and reports the moderation status", async () => {
    vi.mocked(member.saveReview).mockResolvedValueOnce("pending");
    const response = await handlers().saveReview(
      request("PUT", "/x", { rating: 4, body: "\u0007  Quiet and bright, good for reading.  " }),
      { placeId: PLACE },
    );
    expect(await response.json()).toEqual({ status: "pending" });
    expect(member.saveReview).toHaveBeenCalledWith(PLACE, { rating: 4, body: "Quiet and bright, good for reading." });
  });

  it.each([
    [{ rating: 0, body: "Long enough review text here." }],
    [{ rating: 3, body: "too short" }],
    [{ rating: 3, body: "x".repeat(1001) }],
    [{ rating: 3.5, body: "Long enough review text here." }],
  ])("rejects invalid reviews %o", async (body) => {
    expect((await handlers().saveReview(request("PUT", "/x", body), { placeId: PLACE })).status).toBe(400);
    expect(member.saveReview).not.toHaveBeenCalled();
  });

  it("votes, flags and validates IDs", async () => {
    const h = handlers();
    expect((await h.vote(request("PUT", "/x", { helpful: true }), { reviewId: REVIEW_ID })).status).toBe(204);
    expect((await h.vote(request("PUT", "/x", { helpful: true }), { reviewId: "not-a-uuid" })).status).toBe(400);
    expect((await h.flag(request("POST", "/x", { targetType: "review", targetId: REVIEW_ID, reason: "spam" }))).status).toBe(201);
    expect((await h.flag(request("POST", "/x", { targetType: "review", targetId: REVIEW_ID, reason: "boring" }))).status).toBe(400);
  });

  it.each([
    ["limit", 429],
    ["duplicate", 400],
    ["not_allowed", 403],
    ["not_found", 404],
    ["invalid", 400],
    ["unavailable", 503],
  ] as const)("maps store %s errors to %d", async (kind, status) => {
    vi.mocked(member.vote).mockRejectedValueOnce(new CommunityError(kind));
    expect((await handlers().vote(request("PUT", "/x", { helpful: false }), { reviewId: REVIEW_ID })).status).toBe(status);
  });

  it("requires a session and same-origin requests", async () => {
    const h = handlers();
    const crossSite = await h.saveReview(request("PUT", "/x", { rating: 5, body: "Long enough review text here." }, "https://evil.example"), { placeId: PLACE });
    expect(crossSite.status).toBe(403);
    const noOrigin = await h.flag(request("POST", "/x", { targetType: "review", targetId: REVIEW_ID, reason: "spam" }, null));
    expect(noOrigin.status).toBe(403);

    context = { reader, member: null };
    const guest = await h.vote(request("PUT", "/x", { helpful: true }), { reviewId: REVIEW_ID });
    expect(guest.status).toBe(401);
    expect((await errorOf(guest)).code).toBe("AUTH_REQUIRED");
    expect(member.vote).not.toHaveBeenCalled();
  });

  it("limits writes per member", async () => {
    const h = handlers({ reads: 100, writes: 1 });
    await h.vote(request("PUT", "/x", { helpful: true }), { reviewId: REVIEW_ID });
    expect((await h.vote(request("PUT", "/x", { helpful: true }), { reviewId: REVIEW_ID })).status).toBe(429);
  });
});

describe("moderation", () => {
  it("refuses non-moderators before touching the queue or decisions", async () => {
    const h = handlers();
    expect((await h.moderationQueue(request("GET", "/x"))).status).toBe(403);
    const decision = { targetType: "review", targetId: REVIEW_ID, decision: "rejected" };
    expect((await h.moderate(request("POST", "/x", decision))).status).toBe(403);
    expect(member.moderationQueue).not.toHaveBeenCalled();
    expect(member.moderate).not.toHaveBeenCalled();
  });

  it("lets moderators read the queue and decide", async () => {
    vi.mocked(member.isModerator).mockResolvedValue(true);
    const h = handlers();
    expect(await (await h.moderationQueue(request("GET", "/x"))).json()).toEqual({ items: [] });
    const decision = { targetType: "review", targetId: REVIEW_ID, decision: "approved" } as const;
    expect((await h.moderate(request("POST", "/x", decision))).status).toBe(204);
    expect(member.moderate).toHaveBeenCalledWith(decision);
    expect((await h.moderate(request("POST", "/x", { ...decision, decision: "deleted" }))).status).toBe(400);
  });
});
