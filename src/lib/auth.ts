import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export interface CurrentProfile {
  id: string;
  email: string | null;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: "user" | "admin";
  leaderboardOptIn: boolean;
  locale: "mn" | "en";
}

/** The signed-in user's profile, or null. Validates the JWT with Supabase (not just the cookie). */
export async function getCurrentProfile(): Promise<CurrentProfile | null> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return null;

  const { data } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url, role, leaderboard_opt_in, locale")
    .eq("id", userId)
    .maybeSingle();
  if (!data) return null;

  return {
    id: data.id,
    email: (claims.claims.email as string | undefined) ?? null,
    username: data.username,
    displayName: data.display_name,
    avatarUrl: data.avatar_url,
    role: data.role,
    leaderboardOptIn: data.leaderboard_opt_in,
    locale: data.locale,
  };
}

export async function requireProfile(next = "/dashboard"): Promise<CurrentProfile> {
  const profile = await getCurrentProfile();
  if (!profile) redirect(`/login?next=${encodeURIComponent(next)}`);
  return profile;
}

export async function requireAdmin(): Promise<CurrentProfile> {
  const profile = await requireProfile("/admin");
  if (profile.role !== "admin") redirect("/dashboard");
  return profile;
}
