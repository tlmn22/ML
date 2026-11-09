import "server-only";
import { getProviderEnv, type ProviderEnv } from "@/lib/env";
import { MockMlbbProvider } from "./mock/provider";
import type { MlbbProvider } from "./provider";
import { RoneArenaClient } from "./rone-arena/client";
import { RoneArenaProvider } from "./rone-arena/provider";

export function createMlbbProvider(
  env: ProviderEnv,
): MlbbProvider {
  if (env.MLBB_PROVIDER === "mock") {
    if (env.VERCEL_ENV === "production") {
      throw new Error("MLBB_PROVIDER=mock is not allowed in production: mock data must never be shown as real.");
    }
    return new MockMlbbProvider();
  }
  const client = new RoneArenaClient({
    baseUrl: env.RONE_ARENA_BASE_URL,
    allowedHosts: env.RONE_ARENA_ALLOWED_HOSTS,
    timeoutMs: env.RONE_ARENA_TIMEOUT_MS,
  });
  return new RoneArenaProvider(client);
}

let provider: MlbbProvider | undefined;

export function getMlbbProvider(): MlbbProvider {
  provider ??= createMlbbProvider(getProviderEnv());
  return provider;
}

export function isMockProviderActive(): boolean {
  return getProviderEnv().MLBB_PROVIDER === "mock";
}

export { ProviderError, isProviderError } from "./provider";
export type { MlbbProvider, ProviderErrorKind } from "./provider";
