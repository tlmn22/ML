import "server-only";
import { z } from "zod";

const csv = z
  .string()
  .transform((s) => s.split(",").map((part) => part.trim()).filter(Boolean));

const serverSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
  SUPABASE_SECRET_KEY: z.string().min(20),
  NEXT_PUBLIC_SITE_URL: z.url().default("http://localhost:3000"),

  MLBB_PROVIDER: z.enum(["rone_arena", "mock"]).default("rone_arena"),
  RONE_ARENA_BASE_URL: z.url().default("https://arena.rone.dev"),
  RONE_ARENA_ALLOWED_HOSTS: csv.default(["arena.rone.dev", "arena.fastapicloud.dev"]),
  RONE_ARENA_TIMEOUT_MS: z.coerce.number().int().min(1000).max(30000).default(8000),

  /** base64 of exactly 32 random bytes: `openssl rand -base64 32` */
  PROVIDER_TOKEN_ENCRYPTION_KEY: z
    .string()
    .refine((v) => Buffer.from(v, "base64").length === 32, "must be base64 of 32 bytes"),
  IP_HASH_SALT: z.string().min(16),
  CRON_SECRET: z.string().min(16),

  SYNC_INTERVAL_HOURS: z.coerce.number().min(1).max(168).default(12),
  SYNC_BATCH_SIZE: z.coerce.number().int().min(1).max(500).default(25),
  SYNC_REQUEST_DELAY_MS: z.coerce.number().int().min(0).max(10000).default(500),
  SYNC_TIME_BUDGET_MS: z.coerce.number().int().min(5000).max(800000).default(50000),
  USER_SYNC_COOLDOWN_MINUTES: z.coerce.number().int().min(1).max(1440).default(30),

  VERCEL_ENV: z.enum(["production", "preview", "development"]).optional(),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | undefined;

/** Parsed lazily so `next build` can prerender pages that never touch the server env. */
export function getServerEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid server environment:\n${issues}\nSee .env.example.`);
  }
  cached = parsed.data;
  return cached;
}

const providerSchema = serverSchema.pick({
  MLBB_PROVIDER: true,
  RONE_ARENA_BASE_URL: true,
  RONE_ARENA_ALLOWED_HOSTS: true,
  RONE_ARENA_TIMEOUT_MS: true,
  VERCEL_ENV: true,
});

export type ProviderEnv = z.infer<typeof providerSchema>;

/** Just the provider settings (all have defaults), so public pages work without DB secrets. */
export function getProviderEnv(): ProviderEnv {
  return providerSchema.parse(process.env);
}

export function isProductionDeployment(env: Pick<ServerEnv, "VERCEL_ENV"> = getServerEnv()): boolean {
  return env.VERCEL_ENV === "production";
}
