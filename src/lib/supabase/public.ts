import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { publicSupabaseConfig } from "./config";

let client: SupabaseClient | undefined;

/**
 * Anonymous client with no cookies: sees exactly what the public sees under RLS.
 * Safe to use inside `"use cache"` functions because the result doesn't depend on the viewer.
 */
export function createPublicClient(): SupabaseClient {
  if (client) return client;
  const { url, key } = publicSupabaseConfig();
  client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}
