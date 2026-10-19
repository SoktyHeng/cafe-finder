import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { PGlite } from "@electric-sql/pglite";

/**
 * PGlite (real Postgres in WASM) with the parts of Supabase the migrations
 * rely on stubbed: `auth.users`, `auth.uid()` from the JWT `sub` claim, the
 * `anon`/`authenticated` roles, and Supabase's generous default table grants.
 * Grants are deliberately broad so tests prove RLS and the migrations'
 * revokes, not missing grants, are what protect data.
 */
export const SUPABASE_STUB = `
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
  alter default privileges in schema public grant all on functions to anon, authenticated;
`;

const MIGRATIONS_DIR = join(process.cwd(), "supabase/migrations");

/** All migrations, in filename (timestamp) order. */
export function migrationSql(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => /^\d{14}_.+\.sql$/.test(name))
    .sort()
    .map((name) => readFileSync(join(MIGRATIONS_DIR, name), "utf8"));
}

export async function createTestDatabase(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(SUPABASE_STUB);
  for (const sql of migrationSql()) await db.exec(sql);
  return db;
}

/** Runs `run` as a Supabase role, with `userId` as the JWT subject. */
export async function asRole<T>(
  db: PGlite,
  userId: string | null,
  run: () => Promise<T>,
  role: "authenticated" | "anon" = "authenticated",
): Promise<T> {
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId ?? ""]);
  await db.exec(`set role ${role}`);
  try {
    return await run();
  } finally {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub', '', false)");
  }
}

export async function createUser(db: PGlite, id: string, metadata: Record<string, unknown> = {}) {
  await db.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)", [
    id,
    `${id.slice(0, 4)}@example.test`,
    JSON.stringify(metadata),
  ]);
}

/** Booting Postgres (WASM) and applying migrations can be slow on a busy machine. */
export const DB_BOOT_TIMEOUT_MS = 60_000;
