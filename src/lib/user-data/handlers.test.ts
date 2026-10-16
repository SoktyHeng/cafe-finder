import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiErrorBodySchema } from "@/lib/security/api-error";
import { FixedWindowRateLimiter } from "@/lib/security/rate-limit";

import { createUserDataHandlers, isSameOrigin, type UserContext } from "./handlers";
import { ACCOUNT_DELETION_CONFIRMATION, DEFAULT_PREFERENCES, type Favorite } from "./schemas";
import { UserDataError, type UserDataStore } from "./store";

const ORIGIN = "https://cafes.example";

/** In-memory store for ONE user, like the RLS-scoped Supabase store. */
function memoryStore(): UserDataStore & { favorites: Map<string, Favorite> } {
  const favorites = new Map<string, Favorite>();
  return {
    favorites,
    listFavorites: async () => [...favorites.values()],
    saveFavorite: async (placeId, notes) => {
      const favorite = { placeId, notes: notes ?? favorites.get(placeId)?.notes ?? null, createdAt: "2026-10-16T00:00:00.000Z" };
      favorites.set(placeId, favorite);
      return favorite;
    },
    updateFavoriteNotes: async (placeId, notes) => {
      const existing = favorites.get(placeId);
      if (!existing) return null;
      const updated = { ...existing, notes };
      favorites.set(placeId, updated);
      return updated;
    },
    removeFavorite: async (placeId) => {
      favorites.delete(placeId);
    },
    listVisits: async () => [],
    markVisited: async (placeId) => ({ placeId, visitDate: "2026-10-16", createdAt: "2026-10-16T00:00:00.000Z" }),
    unmarkVisited: async () => {},
    getPreferences: async () => DEFAULT_PREFERENCES,
    savePreferences: async (preferences) => preferences,
    getProfile: async () => ({ displayName: null, email: "a@example.test" }),
    updateProfile: async (displayName) => ({ displayName, email: "a@example.test" }),
    deleteAccount: vi.fn(async () => {}),
  };
}

let store: ReturnType<typeof memoryStore>;
let context: UserContext | null | "unconfigured";

function handlers(limit = 100) {
  return createUserDataHandlers({
    getContext: async () => context,
    limiter: new FixedWindowRateLimiter({ limit, windowMs: 60_000 }),
  });
}

function request(
  method: string,
  path: string,
  { body, origin = ORIGIN, contentType = "application/json", headers = {} }: {
    body?: unknown;
    origin?: string | null;
    contentType?: string;
    headers?: Record<string, string>;
  } = {},
) {
  return new Request(`${ORIGIN}${path}`, {
    method,
    headers: {
      ...(origin !== null && { Origin: origin }),
      ...(body !== undefined && { "Content-Type": contentType }),
      ...headers,
    },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
}

const errorCode = async (response: Response) => apiErrorBodySchema.parse(await response.json()).error.code;

beforeEach(() => {
  store = memoryStore();
  context = { userId: "user-a", store };
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
});

describe("authentication", () => {
  it("requires a session (401) and never touches the store", async () => {
    context = null;
    const spy = vi.spyOn(store, "listFavorites");
    const response = await handlers().favorites.GET(request("GET", "/api/favorites"));
    expect(response.status).toBe(401);
    expect(await errorCode(response)).toBe("AUTH_REQUIRED");
    expect(spy).not.toHaveBeenCalled();
  });

  it("reports when sign-in isn't configured", async () => {
    context = "unconfigured";
    const response = await handlers().favorites.GET(request("GET", "/api/favorites"));
    expect(response.status).toBe(503);
  });

  it("treats a failing session lookup as unavailable", async () => {
    const response = await createUserDataHandlers({
      getContext: async () => {
        throw new Error("auth server down");
      },
    }).favorites.GET(request("GET", "/api/favorites"));
    expect(response.status).toBe(503);
  });
});

describe("CSRF protection", () => {
  it.each([
    ["missing Origin", { origin: null }],
    ["foreign Origin", { origin: "https://evil.example" }],
    ["cross-site fetch metadata", { headers: { "Sec-Fetch-Site": "cross-site" } }],
  ])("rejects mutations with %s", async (_label, options) => {
    const response = await handlers().favorites.POST(
      request("POST", "/api/favorites", { body: { placeId: "ChIJa" }, ...options }),
    );
    expect(response.status).toBe(403);
    expect(await errorCode(response)).toBe("FORBIDDEN");
    expect(store.favorites.size).toBe(0);
  });

  it("allows reads without Origin", async () => {
    expect((await handlers().favorites.GET(request("GET", "/api/favorites", { origin: null }))).status).toBe(200);
  });

  it("matches origins exactly", () => {
    const make = (origin: string) => new Request(`${ORIGIN}/x`, { method: "POST", headers: { Origin: origin } });
    expect(isSameOrigin(make(ORIGIN))).toBe(true);
    expect(isSameOrigin(make("https://cafes.example.evil.com"))).toBe(false);
    expect(isSameOrigin(make("http://cafes.example"))).toBe(false);
    expect(isSameOrigin(make("null"))).toBe(false);
  });
});

describe("favorites", () => {
  it("saves, lists, updates notes and removes", async () => {
    const h = handlers();
    const created = await h.favorites.POST(request("POST", "/api/favorites", { body: { placeId: "ChIJa", notes: "  latte  " } }));
    expect(created.status).toBe(201);
    expect(await created.json()).toMatchObject({ favorite: { placeId: "ChIJa", notes: "latte" } });

    const listed = await h.favorites.GET(request("GET", "/api/favorites"));
    expect(listed.headers.get("cache-control")).toBe("private, no-store");
    expect((await listed.json()).favorites).toHaveLength(1);

    const patched = await h.favorites.PATCH(request("PATCH", "/api/favorites", { body: { placeId: "ChIJa", notes: "" } }));
    expect((await patched.json()).favorite.notes).toBeNull();

    const removed = await h.favorites.DELETE(request("DELETE", "/api/favorites?placeId=ChIJa"));
    expect(removed.status).toBe(204);
    expect(store.favorites.size).toBe(0);
  });

  it.each([
    ["an invalid place ID", { placeId: "bad id/.." }],
    ["notes over 500 characters", { placeId: "ChIJa", notes: "x".repeat(501) }],
    ["an unknown field (e.g. user_id)", { placeId: "ChIJa", user_id: "user-b" }],
  ])("rejects %s", async (_label, body) => {
    const response = await handlers().favorites.POST(request("POST", "/api/favorites", { body }));
    expect(response.status).toBe(400);
    expect(store.favorites.size).toBe(0);
  });

  it("rejects non-JSON, malformed and oversized bodies", async () => {
    const h = handlers();
    expect((await h.favorites.POST(request("POST", "/api/favorites", { body: "placeId=x", contentType: "text/plain" }))).status).toBe(400);
    expect((await h.favorites.POST(request("POST", "/api/favorites", { body: "{nope" }))).status).toBe(400);
    expect((await h.favorites.POST(request("POST", "/api/favorites", { body: { placeId: "ChIJa", notes: "x".repeat(5000) } }))).status).toBe(400);
  });

  it("validates the place ID on delete", async () => {
    expect((await handlers().favorites.DELETE(request("DELETE", "/api/favorites?placeId=..%2F"))).status).toBe(400);
  });

  it("returns 404 when updating notes on a non-favorite", async () => {
    const response = await handlers().favorites.PATCH(request("PATCH", "/api/favorites", { body: { placeId: "ChIJz", notes: "x" } }));
    expect(response.status).toBe(404);
  });

  it.each([
    ["limit", 400, /limit of 500/],
    ["invalid", 400, /not allowed/],
    ["unavailable", 503, /temporarily unavailable/],
  ] as const)("maps store %s errors safely", async (kind, status, message) => {
    store.saveFavorite = async () => {
      throw new UserDataError(kind);
    };
    const response = await handlers().favorites.POST(request("POST", "/api/favorites", { body: { placeId: "ChIJa" } }));
    expect(response.status).toBe(status);
    expect(apiErrorBodySchema.parse(await response.json()).error.message).toMatch(message);
  });

  it("does not leak unexpected error details", async () => {
    store.listFavorites = async () => {
      throw new Error("relation favorite_places does not exist at 10.0.0.5");
    };
    const response = await handlers().favorites.GET(request("GET", "/api/favorites"));
    const text = await response.text();
    expect(response.status).toBe(503);
    expect(text).not.toContain("10.0.0.5");
    expect(text).not.toContain("favorite_places");
  });
});

describe("preferences, profile, visits and account", () => {
  it("validates and saves preferences", async () => {
    const h = handlers();
    const preferences = { ...DEFAULT_PREFERENCES, purpose: "date", radiusMeters: 5000, minRating: 4.5, preferWifi: true };
    const saved = await h.preferences.PUT(request("PUT", "/api/preferences", { body: preferences }));
    expect(await saved.json()).toEqual({ preferences });

    for (const bad of [{ ...preferences, radiusMeters: 500 }, { ...preferences, purpose: "party" }, { ...preferences, minRating: 4.55 }, { purpose: "work" }]) {
      expect((await h.preferences.PUT(request("PUT", "/api/preferences", { body: bad }))).status).toBe(400);
    }
  });

  it("updates the display name, trimming and clearing blanks", async () => {
    const h = handlers();
    expect((await (await h.profile.PATCH(request("PATCH", "/api/profile", { body: { displayName: "  Sokha " } }))).json()).profile.displayName).toBe("Sokha");
    expect((await (await h.profile.PATCH(request("PATCH", "/api/profile", { body: { displayName: "   " } }))).json()).profile.displayName).toBeNull();
    expect((await h.profile.PATCH(request("PATCH", "/api/profile", { body: { displayName: "x".repeat(81) } }))).status).toBe(400);
  });

  it("marks and unmarks visits", async () => {
    const h = handlers();
    expect((await h.visits.POST(request("POST", "/api/visits", { body: { placeId: "ChIJv" } }))).status).toBe(201);
    expect((await h.visits.DELETE(request("DELETE", "/api/visits?placeId=ChIJv"))).status).toBe(204);
  });

  it("deletes the account only with the exact confirmation phrase", async () => {
    const h = handlers();
    expect((await h.account.DELETE(request("DELETE", "/api/account", { body: { confirm: "yes" } }))).status).toBe(400);
    expect((await h.account.DELETE(request("DELETE", "/api/account", { body: {} }))).status).toBe(400);
    expect(store.deleteAccount).not.toHaveBeenCalled();

    const response = await h.account.DELETE(request("DELETE", "/api/account", { body: { confirm: ACCOUNT_DELETION_CONFIRMATION } }));
    expect(response.status).toBe(204);
    expect(store.deleteAccount).toHaveBeenCalledOnce();
  });

  it("refuses account deletion from another site", async () => {
    const response = await handlers().account.DELETE(
      request("DELETE", "/api/account", { body: { confirm: ACCOUNT_DELETION_CONFIRMATION }, origin: "https://evil.example" }),
    );
    expect(response.status).toBe(403);
    expect(store.deleteAccount).not.toHaveBeenCalled();
  });
});

describe("rate limiting", () => {
  it("limits per user with Retry-After, independently for each user", async () => {
    const h = handlers(2);
    await h.favorites.GET(request("GET", "/api/favorites"));
    await h.favorites.GET(request("GET", "/api/favorites"));
    const limited = await h.favorites.GET(request("GET", "/api/favorites"));
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);

    context = { userId: "user-b", store: memoryStore() };
    expect((await h.favorites.GET(request("GET", "/api/favorites"))).status).toBe(200);
  });
});
