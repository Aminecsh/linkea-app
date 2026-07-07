import { supabase } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

/**
 * Returns the current user from the local session cache.
 * Unlike getUser(), this does NOT make a network request to validate the JWT.
 * Supabase validates the token on every DB query anyway.
 * Use this for page-level auth guards.
 */
export async function getAuthUser(): Promise<User | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user ?? null;
}

/**
 * Returns both user and access token from the local session cache.
 */
export async function getAuthSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return { user: session?.user ?? null, token: session?.access_token ?? null };
}
