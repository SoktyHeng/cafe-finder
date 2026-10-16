import { describe, expect, it, vi } from "vitest";

import type { AppSupabaseClient } from "@/lib/supabase/types";

import { DEFAULT_PREFERENCES } from "./schemas";
import { UserDataError } from "./store";
import { createSupabaseUserDataStore } from "./supabase-store";

type Result = { data?: unknown; error?: { code?: string; message: string } | null };
type Call = { table: string; ops: [string, unknown[]][] };

/** Records PostgREST builder chains and replays queued results per table. */
function fakeClient(results: Record<string, Result[]> = {}) {
  const calls: Call[] = [];
  const client = {
    from(table: string) {
      const call: Call = { table, ops: [] };
      calls.push(call);
      const builder: object = new Proxy(
        {},
        {
          get(_target, prop) {
            if (prop === "then") {
              const result = results[table]?.shift() ?? { data: null, error: null };
              return (resolve: (value: unknown) => void) => resolve({ data: null, error: null, ...result });
            }
            return (...args: unknown[]) => {
              call.ops.push([String(prop), args]);
              return builder;
            };
          },
        },
      );
      return builder;
    },
    rpc: vi.fn(async () => ({ error: null })),
    auth: { signOut: vi.fn(async () => ({ error: null })) },
  };
  return { client: client as unknown as AppSupabaseClient, calls, raw: client };
}

const USER = { id: "user-a", email: "a@example.test" };
const ROW = { google_place_id: "ChIJa", notes: "flat white", created_at: "2026-10-16T01:00:00Z" };

describe("Supabase user data store", () => {
  it("lists favorites newest first, bounded", async () => {
    const { client, calls } = fakeClient({ favorite_places: [{ data: [ROW] }] });
    expect(await createSupabaseUserDataStore(client, USER).listFavorites()).toEqual([
      { placeId: "ChIJa", notes: "flat white", createdAt: "2026-10-16T01:00:00Z" },
    ]);
    expect(calls[0]).toEqual({
      table: "favorite_places",
      ops: [
        ["select", ["google_place_id, notes, created_at"]],
        ["order", ["created_at", { ascending: false }]],
        ["limit", [500]],
      ],
    });
  });

  it("ensures profile rows, then upserts the favorite on (user_id, google_place_id)", async () => {
    const { client, calls } = fakeClient({ favorite_places: [{ data: ROW }] });
    await createSupabaseUserDataStore(client, USER).saveFavorite("ChIJa", undefined);

    expect(calls.map((call) => call.table)).toEqual(["profiles", "user_preferences", "favorite_places"]);
    expect(calls[0]?.ops[0]).toEqual(["upsert", [{ id: "user-a" }, { onConflict: "id", ignoreDuplicates: true }]]);
    // Undefined notes are omitted so re-saving keeps existing notes.
    expect(calls[2]?.ops[0]).toEqual([
      "upsert",
      [{ user_id: "user-a", google_place_id: "ChIJa" }, { onConflict: "user_id,google_place_id" }],
    ]);
  });

  it("filters updates and deletes by place ID only (RLS scopes them to the user)", async () => {
    const { client, calls } = fakeClient({ favorite_places: [{ data: ROW }, {}] });
    const store = createSupabaseUserDataStore(client, USER);
    await store.updateFavoriteNotes("ChIJa", null);
    await store.removeFavorite("ChIJa");
    expect(calls[0]?.ops.slice(0, 2)).toEqual([["update", [{ notes: null }]], ["eq", ["google_place_id", "ChIJa"]]]);
    expect(calls[1]?.ops).toEqual([["delete", []], ["eq", ["google_place_id", "ChIJa"]]]);
  });

  it.each([
    [{ code: "23514", message: "Row limit of 500 reached for favorite_places" }, "limit"],
    [{ code: "23514", message: "new row violates check constraint" }, "invalid"],
    [{ code: "22P02", message: "invalid input syntax" }, "invalid"],
    [{ code: "PGRST301", message: "JWT expired" }, "unavailable"],
  ])("maps %o to %s", async (error, kind) => {
    const { client } = fakeClient({ favorite_places: [{ error }] });
    await expect(createSupabaseUserDataStore(client, USER).saveFavorite("ChIJa", null)).rejects.toEqual(
      new UserDataError(kind as "limit" | "invalid" | "unavailable"),
    );
  });

  it("maps preference rows (and falls back to defaults when missing)", async () => {
    const { client } = fakeClient({
      user_preferences: [
        {
          data: {
            user_id: "user-a",
            default_purpose: "date",
            default_radius_m: 5000,
            min_rating: "4.5",
            open_now_only: true,
            budget_tier: "under_5",
            prefer_quiet: true,
            prefer_wifi: false,
            updated_at: "x",
          },
        },
        { data: null },
      ],
    });
    const store = createSupabaseUserDataStore(client, USER);
    expect(await store.getPreferences()).toEqual({
      purpose: "date",
      radiusMeters: 5000,
      minRating: 4.5,
      openNowOnly: true,
      budget: "under_5",
      preferQuiet: true,
      preferWifi: false,
    });
    expect(await store.getPreferences()).toEqual(DEFAULT_PREFERENCES);
  });

  it("returns the verified email with the profile", async () => {
    const { client } = fakeClient({ profiles: [{ data: { display_name: "Sokha" } }] });
    expect(await createSupabaseUserDataStore(client, USER).getProfile()).toEqual({
      displayName: "Sokha",
      email: "a@example.test",
    });
  });

  it("deletes the account through the RPC, then clears the local session", async () => {
    const { client, raw } = fakeClient();
    await createSupabaseUserDataStore(client, USER).deleteAccount();
    expect(raw.rpc).toHaveBeenCalledWith("delete_own_account");
    expect(raw.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });
});
