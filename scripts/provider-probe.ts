/**
 * End-to-end check of the Rone Arena verification flow with YOUR OWN MLBB account.
 *
 *   npm run provider:probe
 *
 * Sends a code to your in-game mail, logs in with it, fetches /api/user/info,
 * prints the response (JWT redacted) and the decoded rank, then logs out.
 * Never run this against an account you don't own: it mails that player a code.
 */
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { RoneArenaClient } from "../src/lib/mlbb/rone-arena/client";
import { RoneArenaProvider } from "../src/lib/mlbb/rone-arena/provider";
import { decodeRankLevel } from "../src/lib/mlbb/ranks";
import { isProviderError } from "../src/lib/mlbb/provider";

const BASE_URL = process.env.RONE_ARENA_BASE_URL ?? "https://arena.rone.dev";

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) =>
        /jwt|token|session|email|mobile|open_id/i.test(k) && v ? [k, "«redacted»"] : [k, redact(v)],
      ),
    );
  }
  return value;
}

async function main() {
  const rl = createInterface({ input: stdin, output: stdout });
  const client = new RoneArenaClient({ baseUrl: BASE_URL, allowedHosts: ["arena.rone.dev", "arena.fastapicloud.dev"] });
  const provider = new RoneArenaProvider(client);

  console.log(`\nRone Arena probe → ${BASE_URL}\n`);
  const roleId = Number((await rl.question("Your Game ID (Role ID): ")).trim());
  const zoneId = Number((await rl.question("Your Server ID (Zone ID): ")).trim());
  if (!Number.isInteger(roleId) || !Number.isInteger(zoneId) || roleId <= 0 || zoneId <= 0) {
    throw new Error("IDs must be positive integers");
  }
  const confirm = await rl.question(`Send a verification code to ${roleId} (${zoneId})? This must be YOUR account. [y/N] `);
  if (confirm.trim().toLowerCase() !== "y") return rl.close();

  console.log("\n[1/4] POST /api/user/auth/send-vc …");
  await provider.requestVerificationCode({ roleId, zoneId });
  console.log("      ok — check MLBB → Mail (code is valid for 5 minutes)");

  const code = (await rl.question("\nCode from in-game mail: ")).trim();
  console.log("[2/4] POST /api/user/auth/login …");
  const session = await provider.completeVerification({ roleId, zoneId }, code);
  console.log(`      ok — login identity: ${session.roleId} (${session.zoneId}), jwt length ${session.token.length}`);

  console.log("[3/4] GET /api/user/info …");
  const raw = await fetch(`${client.currentBaseUrl}/api/user/info?lang=en`, {
    headers: { Authorization: `Bearer ${session.token}`, Accept: "application/json" },
  });
  const rawBody = await raw.json().catch(() => null);
  console.log(`      HTTP ${raw.status}. Raw response (redacted):`);
  console.log(JSON.stringify(redact(rawBody), null, 2));

  const profile = await provider.getPlayerProfile(session.token);
  const current = decodeRankLevel(profile.rankLevel);
  const highest = decodeRankLevel(profile.highestRankLevel);
  console.log("\n      Normalized profile:");
  console.log(JSON.stringify(profile, null, 2));
  console.log(`\n      Decoded current rank: ${current?.label ?? "—"} (rank_level ${profile.rankLevel})`);
  console.log(`      Decoded highest rank: ${highest?.label ?? "—"} (history_rank_level ${profile.highestRankLevel})`);
  console.log(`      Identity check: ${profile.roleId === roleId && profile.zoneId === zoneId ? "MATCH ✓" : "MISMATCH ✗"}`);

  console.log("\n[4/4] POST /api/user/auth/logout …");
  await provider.endSession(session.token).then(
    () => console.log("      ok"),
    (e) => console.log(`      logout failed (non-fatal): ${e.message}`),
  );

  const ingame = await rl.question("\nWhat rank and stars does the game show right now? (e.g. Legend III 2★): ");
  console.log(`\nPlease send this whole output to the developer. In-game rank reported: "${ingame.trim()}"\n`);
  rl.close();
}

main().catch((error) => {
  if (isProviderError(error)) {
    console.error(`\nProvider error [${error.kind}]${error.status ? ` HTTP ${error.status}` : ""}: ${error.message}`);
  } else {
    console.error("\nFailed:", error);
  }
  process.exit(1);
});
