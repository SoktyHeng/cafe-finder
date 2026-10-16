// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

/**
 * Runs the real migration in PGlite (Postgres compiled to WASM) with the parts
 * of Supabase it relies on stubbed: the `auth.users` table, `auth.uid()`
 * reading the JWT `sub` claim, the `anon`/`authenticated` roles, and
 * Supabase's default table grants. Grants are deliberately generous, so these
 * tests prove that RLS (not missing grants) is what isolates users.
 */
const MIGRATION = readFileSync(
  join(process.cwd(), "supabase/migrations/20261016000000_m5_profiles_favorites.sql"),
  "utf8",
);

const SUPABASE_STUB = `
  create schema auth;
  create table auth.users (
    id uuid primary key,
    email text,
    raw_user_meta_data jsonb not null default '{}'
  );
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  create role anon nologin;
  create role authenticated nologin;
  grant usage on schema public, auth to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
`;

const ALICE = "11111111-1111-4111-8111-111111111111";
const BOB = "22222222-2222-4222-8222-222222222222";

let db: PGlite;

async function asUser<T>(userId: string | null, run: () => Promise<T>, role = "authenticated"): Promise<T> {
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId ?? ""]);
  await db.exec(`set role ${role}`);
  try {
    return await run();
  } finally {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub', '', false)");
  }
}

const rows = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
  (await db.query<T>(sql, params)).rows;
const affected = async (sql: string, params: unknown[] = []) =>
  (await db.query(sql, params)).affectedRows ?? 0;

async function createUser(id: string, metadata: Record<string, unknown> = {}) {
  await db.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)", [
    id,
    `${id.slice(0, 4)}@example.test`,
    JSON.stringify(metadata),
  ]);
}

// Booting Postgres (WASM) and applying the migration can take a while on a busy machine.
const BOOT_TIMEOUT_MS = 60_000;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STUB);
  await db.exec(MIGRATION);
}, BOOT_TIMEOUT_MS);

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.exec("reset role; delete from auth.users;");
  await createUser(ALICE, { full_name: "Alice Example" });
  await createUser(BOB);
});

describe("new-user trigger", () => {
  it("creates a profile and default preferences", async () => {
    expect(await rows("select id, display_name from public.profiles order by display_name nulls last")).toEqual([
      { id: ALICE, display_name: "Alice Example" },
      { id: BOB, display_name: null },
    ]);
    expect(await rows("select default_purpose, default_radius_m, budget_tier from public.user_preferences where user_id = $1", [ALICE])).toEqual([
      { default_purpose: "work", default_radius_m: 3000, budget_tier: "any" },
    ]);
  });

  it("truncates long names and ignores blank ones", async () => {
    const carol = "33333333-3333-4333-8333-333333333333";
    const dave = "44444444-4444-4444-8444-444444444444";
    await createUser(carol, { name: "x".repeat(120) });
    await createUser(dave, { full_name: "   " });
    const [carolProfile] = await rows<{ display_name: string }>("select display_name from public.profiles where id = $1", [carol]);
    expect(carolProfile?.display_name).toHaveLength(80);
    expect(await rows("select display_name from public.profiles where id = $1", [dave])).toEqual([{ display_name: null }]);
  });
});

describe("favorites RLS", () => {
  beforeEach(async () => {
    await asUser(ALICE, () => db.query("insert into public.favorite_places (google_place_id, notes) values ('ChIJalice1', 'great espresso')"));
  });

  it("defaults user_id to the caller and lets owners read their rows", async () => {
    const own = await asUser(ALICE, () => rows("select user_id, google_place_id, notes from public.favorite_places"));
    expect(own).toEqual([{ user_id: ALICE, google_place_id: "ChIJalice1", notes: "great espresso" }]);
  });

  it("hides other users' favorites", async () => {
    expect(await asUser(BOB, () => rows("select * from public.favorite_places"))).toEqual([]);
  });

  it("blocks inserting rows for someone else", async () => {
    await expect(
      asUser(BOB, () => db.query("insert into public.favorite_places (user_id, google_place_id) values ($1, 'ChIJx')", [ALICE])),
    ).rejects.toThrow(/row-level security/);
  });

  it("blocks updating or deleting someone else's rows (no rows affected)", async () => {
    expect(await asUser(BOB, () => affected("update public.favorite_places set notes = 'hacked'"))).toBe(0);
    expect(await asUser(BOB, () => affected("delete from public.favorite_places"))).toBe(0);
    expect(await rows("select notes from public.favorite_places")).toEqual([{ notes: "great espresso" }]);
  });

  it("blocks handing a row over to another user", async () => {
    await expect(
      asUser(ALICE, () => db.query("update public.favorite_places set user_id = $1", [BOB])),
    ).rejects.toThrow(/row-level security/);
  });

  it("denies anonymous access entirely", async () => {
    await expect(asUser(null, () => rows("select * from public.favorite_places"), "anon")).rejects.toThrow(/permission denied/);
    await expect(
      asUser(null, () => db.query("insert into public.favorite_places (user_id, google_place_id) values ($1, 'ChIJx')", [ALICE]), "anon"),
    ).rejects.toThrow(/permission denied/);
  });

  it("denies authenticated requests without a user", async () => {
    expect(await asUser(null, () => rows("select * from public.favorite_places"))).toEqual([]);
    await expect(asUser(null, () => db.query("insert into public.favorite_places (google_place_id) values ('ChIJx')"))).rejects.toThrow();
  });

  it("rejects duplicates, invalid place IDs and oversized notes", async () => {
    await expect(asUser(ALICE, () => db.query("insert into public.favorite_places (google_place_id) values ('ChIJalice1')"))).rejects.toThrow(/duplicate key/);
    await expect(asUser(ALICE, () => db.query("insert into public.favorite_places (google_place_id) values ('bad id/..')"))).rejects.toThrow(/google_place_id/);
    await expect(
      asUser(ALICE, () => db.query("insert into public.favorite_places (google_place_id, notes) values ('ChIJn', $1)", ["x".repeat(501)])),
    ).rejects.toThrow(/check constraint/);
  });

  it("caps favorites per user", async () => {
    await asUser(ALICE, () =>
      db.query("insert into public.favorite_places (google_place_id) select 'ChIJbulk' || n from generate_series(1, 499) n"),
    );
    await expect(asUser(ALICE, () => db.query("insert into public.favorite_places (google_place_id) values ('ChIJone_more')"))).rejects.toThrow(/Row limit of 500/);
    // Other users are unaffected.
    await asUser(BOB, () => db.query("insert into public.favorite_places (google_place_id) values ('ChIJbob')"));
  });
});

describe("visits RLS", () => {
  it("isolates visited places per user", async () => {
    await asUser(ALICE, () => db.query("insert into public.visit_feedback (google_place_id, visit_date, liked) values ('ChIJv', current_date, true)"));
    expect(await asUser(BOB, () => rows("select * from public.visit_feedback"))).toEqual([]);
    expect(await asUser(BOB, () => affected("delete from public.visit_feedback"))).toBe(0);
    expect(await asUser(ALICE, () => rows("select google_place_id, liked from public.visit_feedback"))).toEqual([{ google_place_id: "ChIJv", liked: true }]);
  });
});

describe("profiles and preferences RLS", () => {
  it("lets users read and update only their own profile", async () => {
    expect(await asUser(BOB, () => rows("select id from public.profiles"))).toEqual([{ id: BOB }]);
    expect(await asUser(BOB, () => affected("update public.profiles set display_name = 'Mallory' where id = $1", [ALICE]))).toBe(0);
    expect(await asUser(BOB, () => affected("update public.profiles set display_name = 'Bob' where id = $1", [BOB]))).toBe(1);
  });

  it("does not let users delete profiles directly", async () => {
    await expect(asUser(ALICE, () => db.query("delete from public.profiles"))).rejects.toThrow(/permission denied/);
  });

  it("revokes TRUNCATE (which would bypass RLS) on every table", async () => {
    for (const table of ["profiles", "user_preferences", "favorite_places", "visit_feedback"]) {
      await expect(asUser(ALICE, () => db.exec(`truncate public.${table} cascade`))).rejects.toThrow(/permission denied/);
    }
  });

  it("isolates preferences and enforces their constraints", async () => {
    expect(await asUser(BOB, () => rows("select user_id from public.user_preferences"))).toEqual([{ user_id: BOB }]);
    expect(await asUser(BOB, () => affected("update public.user_preferences set prefer_wifi = true where user_id = $1", [ALICE]))).toBe(0);
    await expect(asUser(BOB, () => db.query("update public.user_preferences set default_radius_m = 500"))).rejects.toThrow(/check constraint/);
    await expect(asUser(BOB, () => db.query("update public.user_preferences set default_purpose = 'party'"))).rejects.toThrow(/check constraint/);
  });

  it("maintains updated_at", async () => {
    await db.query("update public.profiles set updated_at = now() - interval '1 day' where id = $1", [BOB]);
    await asUser(BOB, () => db.query("update public.profiles set display_name = 'Bob' where id = $1", [BOB]));
    const [profile] = await rows<{ fresh: boolean }>("select updated_at > now() - interval '1 minute' as fresh from public.profiles where id = $1", [BOB]);
    expect(profile?.fresh).toBe(true);
  });
});

describe("delete_own_account()", () => {
  beforeEach(async () => {
    await asUser(ALICE, () => db.query("insert into public.favorite_places (google_place_id) values ('ChIJa')"));
    await asUser(ALICE, () => db.query("insert into public.visit_feedback (google_place_id) values ('ChIJa')"));
    await asUser(BOB, () => db.query("insert into public.favorite_places (google_place_id) values ('ChIJb')"));
  });

  it("removes the caller and all of their first-party data, nobody else's", async () => {
    await asUser(ALICE, () => db.query("select public.delete_own_account()"));

    expect(await rows("select id from auth.users")).toEqual([{ id: BOB }]);
    for (const table of ["profiles", "user_preferences"]) {
      expect(await rows(`select * from public.${table} where ${table === "profiles" ? "id" : "user_id"} = $1`, [ALICE])).toEqual([]);
    }
    for (const table of ["favorite_places", "visit_feedback"]) {
      expect(await rows(`select * from public.${table} where user_id = $1`, [ALICE])).toEqual([]);
    }
    expect(await rows("select google_place_id from public.favorite_places")).toEqual([{ google_place_id: "ChIJb" }]);
  });

  it("cannot be called anonymously or without a user", async () => {
    await expect(asUser(null, () => db.query("select public.delete_own_account()"), "anon")).rejects.toThrow(/permission denied/);
    await expect(asUser(null, () => db.query("select public.delete_own_account()"))).rejects.toThrow(/Not authenticated/);
    expect(await rows("select count(*)::int as n from auth.users")).toEqual([{ n: 2 }]);
  });

  it("is not callable on internal helpers", async () => {
    await expect(asUser(ALICE, () => db.query("select public.handle_new_user()"))).rejects.toThrow(/permission denied|trigger functions/);
  });
});
