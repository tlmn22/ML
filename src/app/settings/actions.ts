"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireProfile } from "@/lib/auth";
import { getServerEnv } from "@/lib/env";
import { getMlbbProvider } from "@/lib/mlbb";
import { decryptSecret } from "@/lib/security/crypto";
import { LEADERBOARD_TAG } from "@/lib/services/leaderboard";
import { playerTag } from "@/lib/services/players";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { usernameSchema } from "@/lib/validation";
import { getDictionary } from "@/lib/i18n";

const t = getDictionary();

export interface ActionState {
  ok: boolean;
  message: string | null;
}

const profileSchema = z.object({
  username: usernameSchema,
  displayName: z.string().trim().max(40),
  leaderboardOptIn: z.boolean(),
});

export async function updateProfile(_prev: ActionState, form: FormData): Promise<ActionState> {
  const profile = await requireProfile("/settings");
  const parsed = profileSchema.safeParse({
    username: form.get("username"),
    displayName: form.get("displayName") ?? "",
    leaderboardOptIn: form.get("leaderboardOptIn") === "on",
  });
  if (!parsed.success) return { ok: false, message: t.settings.usernameHint };

  // Runs as the user: RLS + column grants restrict what can change.
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      username: parsed.data.username,
      display_name: parsed.data.displayName || null,
      leaderboard_opt_in: parsed.data.leaderboardOptIn,
    })
    .eq("id", profile.id);

  if (error) {
    return { ok: false, message: error.code === "23505" ? t.settings.usernameTaken : t.common.unknownError };
  }
  updateTag(LEADERBOARD_TAG);
  updateTag(playerTag(profile.username));
  updateTag(playerTag(parsed.data.username));
  return { ok: true, message: t.common.saved };
}

/** Remove the linked MLBB account: end the provider session, then delete account + history. */
async function unlinkFor(profileId: string, username: string) {
  const admin = createAdminClient();
  const { data: account } = await admin.from("mlbb_accounts").select("id").eq("profile_id", profileId).maybeSingle();
  if (!account) return;

  const { data: encrypted } = await admin.rpc("mlbb_account_token", { p_account_id: account.id });
  if (typeof encrypted === "string") {
    try {
      await getMlbbProvider().endSession(decryptSecret(encrypted, getServerEnv().PROVIDER_TOKEN_ENCRYPTION_KEY));
    } catch {
      // Best effort: the stored token is deleted below either way.
    }
  }

  const { error } = await admin.from("mlbb_accounts").delete().eq("id", account.id);
  if (error) throw new Error(`unlink failed: ${error.message}`);
  await admin.rpc("write_audit", {
    p_actor_id: profileId,
    p_action: "mlbb.unlink",
    p_target_type: "mlbb_account",
    p_target_id: account.id,
  });
  updateTag(LEADERBOARD_TAG);
  updateTag(playerTag(username));
}

export async function unlinkAccount(): Promise<ActionState> {
  const profile = await requireProfile("/settings");
  try {
    await unlinkFor(profile.id, profile.username);
    return { ok: true, message: t.settings.unlinked };
  } catch (error) {
    console.error(error);
    return { ok: false, message: t.common.unknownError };
  }
}

export async function deleteAccount(_prev: ActionState, form: FormData): Promise<ActionState> {
  const profile = await requireProfile("/settings");
  if (String(form.get("confirm") ?? "").trim().toLowerCase() !== profile.username) {
    return { ok: false, message: t.settings.deleteConfirmLabel };
  }
  try {
    await unlinkFor(profile.id, profile.username);
    const admin = createAdminClient();
    await admin.rpc("write_audit", {
      p_actor_id: profile.id,
      p_action: "account.deleted",
      p_target_type: "profile",
      p_target_id: profile.id,
    });
    const { error } = await admin.auth.admin.deleteUser(profile.id);
    if (error) throw new Error(error.message);
  } catch (error) {
    console.error("account deletion failed", error);
    return { ok: false, message: t.common.unknownError };
  }
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
