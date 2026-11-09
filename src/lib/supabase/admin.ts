import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getServerEnv } from "@/lib/env";

let admin: SupabaseClient | undefined;

/** Service-role client: bypasses RLS. Server-only; use only after authorizing the caller. */
export function createAdminClient(): SupabaseClient {
  if (admin) return admin;
  const env = getServerEnv();
  admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return admin;
}
