import "server-only";
import { getServerEnv } from "@/lib/env";
import { getMlbbProvider } from "@/lib/mlbb";
import { decryptSecret, encryptSecret } from "@/lib/security/crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SyncDeps } from "./rank-sync";
import { supabaseSyncStore, supabaseVerificationStore } from "./supabase-stores";
import type { VerificationDeps } from "./verification";

/** Production wiring of the services to Supabase, the configured provider, and the env key. */

export function verificationDeps(): VerificationDeps {
  const env = getServerEnv();
  return {
    provider: getMlbbProvider(),
    store: supabaseVerificationStore(createAdminClient()),
    encrypt: (plaintext) => encryptSecret(plaintext, env.PROVIDER_TOKEN_ENCRYPTION_KEY),
    syncIntervalHours: env.SYNC_INTERVAL_HOURS,
  };
}

export function syncDeps(): SyncDeps {
  const env = getServerEnv();
  return {
    provider: getMlbbProvider(),
    store: supabaseSyncStore(createAdminClient()),
    decrypt: (payload) => decryptSecret(payload, env.PROVIDER_TOKEN_ENCRYPTION_KEY),
    intervalHours: env.SYNC_INTERVAL_HOURS,
  };
}
