import "server-only";

import { createSupabaseServerClient, getVerifiedUser } from "@/lib/supabase/server";

import type { UserContext } from "./handlers";
import { createSupabaseUserDataStore } from "./supabase-store";

/** Resolves the verified user and an RLS-scoped store for the current request. */
export async function getUserContext(): Promise<UserContext | null | "unconfigured"> {
  const client = await createSupabaseServerClient();
  if (!client) return "unconfigured";
  const user = await getVerifiedUser(client);
  return user ? { userId: user.id, store: createSupabaseUserDataStore(client, user) } : null;
}
