import { describe, expect, it, vi } from "vitest";
import { ProviderError } from "@/lib/mlbb/provider";
import { RoneArenaClient } from "@/lib/mlbb/rone-arena/client";
import { RoneArenaProvider, slugify, unwrapImageUrl } from "@/lib/mlbb/rone-arena/provider";

type Handler = (url: URL, init: RequestInit) => Response | Promise<Response>;

function json(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

function setup(handler: Handler) {
  const calls: { url: URL; init: RequestInit }[] = [];
  const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push({ url, init: init ?? {} });
    return handler(url, init ?? {});
  }) as unknown as typeof fetch;
  const client = new RoneArenaClient({
    baseUrl: "https://arena.rone.dev",
    allowedHosts: ["arena.rone.dev", "arena.fastapicloud.dev"],
    fetchImpl,
    sleep: async () => {},
  });
  return { client, provider: new RoneArenaProvider(client), calls };
}

const account = { roleId: 1234567890, zoneId: 1234 };

// Error envelope observed live on 2026-11-05.
const unauthorizedBody = {
  status: "error",
  code: "UPSTREAM_REQUEST_FAILED",
  message: "We could not process your request right now due to an upstream service issue. Please contact support.",
};

describe("RoneArenaClient", () => {
  it("retries GETs on 5xx and then succeeds", async () => {
    let n = 0;
    const { provider, calls } = setup(() =>
      ++n < 3 ? json(502, { status: "error", code: "BAD_GATEWAY" }) : json(200, { code: 0, data: { records: [], total: 0 } }),
    );
    await expect(provider.listHeroes()).resolves.toEqual([]);
    expect(calls).toHaveLength(3);
  });

  it("gives up after max retries with `unavailable`", async () => {
    const { provider, calls } = setup(() => json(503, { status: "error", code: "UNAVAILABLE" }));
    await expect(provider.listHeroes()).rejects.toMatchObject({ kind: "unavailable" });
    expect(calls).toHaveLength(3);
  });

  it("never retries sending a verification code", async () => {
    const { provider, calls } = setup(() => json(503, { status: "error", code: "UNAVAILABLE" }));
    await expect(provider.requestVerificationCode(account)).rejects.toMatchObject({ kind: "unavailable" });
    expect(calls).toHaveLength(1);
  });

  it("fails over to an allow-listed alternative_endpoint only", async () => {
    const good = setup((url) =>
      url.host === "arena.rone.dev"
        ? json(503, { status: "error", code: "HIGH_TRAFFIC", alternative_endpoint: "https://arena.fastapicloud.dev" })
        : json(200, { code: 0, data: { records: [], total: 0 } }),
    );
    await good.provider.listHeroes();
    expect(good.calls.map((c) => c.url.host)).toEqual(["arena.rone.dev", "arena.fastapicloud.dev"]);

    const evil = setup(() =>
      json(503, { status: "error", code: "HIGH_TRAFFIC", alternative_endpoint: "https://evil.example.com" }),
    );
    await expect(evil.provider.listHeroes()).rejects.toBeInstanceOf(ProviderError);
    expect(new Set(evil.calls.map((c) => c.url.host))).toEqual(new Set(["arena.rone.dev"]));
  });

  it("maps a timeout to `unavailable`", async () => {
    const { provider } = setup(() => {
      throw new DOMException("timed out", "TimeoutError");
    });
    await expect(provider.listHeroes()).rejects.toMatchObject({ kind: "unavailable" });
  });

  it("rejects responses that don't match the schema", async () => {
    const { provider } = setup(() => json(200, { code: 0, data: { records: [{ nope: true }] } }));
    await expect(provider.listHeroes()).rejects.toMatchObject({ kind: "invalid_response" });
  });

  it("never caches authenticated requests", async () => {
    const { provider, calls } = setup(() => json(401, unauthorizedBody));
    await provider.getPlayerProfile("jwt").catch(() => undefined);
    expect(calls[0].init.cache).toBe("no-store");
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe("Bearer jwt");
  });
});

describe("RoneArenaProvider user flow", () => {
  it("sends role_id/zone_id as integers to send-vc", async () => {
    const { provider, calls } = setup(() => json(200, { code: 0, data: "", msg: "ok" }));
    await provider.requestVerificationCode(account);
    expect(calls[0].url.pathname).toBe("/api/user/auth/send-vc");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ role_id: 1234567890, zone_id: 1234 });
  });

  it("returns the session from a documented login response", async () => {
    const { provider, calls } = setup(() =>
      json(200, {
        code: 0,
        data: { email: "", jwt: "eyJ.test.jwt", roleid: 1234567890, zoneid: 1234, time: 1774975992, token: "x" },
        msg: "ok",
      }),
    );
    await expect(provider.completeVerification(account, "0420")).resolves.toEqual({
      token: "eyJ.test.jwt",
      roleId: 1234567890,
      zoneId: 1234,
    });
    expect(JSON.parse(String(calls[0].init.body)).vc).toBe(420);
  });

  it("treats a non-zero login code or a 401 as an invalid code", async () => {
    const nonZero = setup(() => json(200, { code: 1001, msg: "verify code error", data: null }));
    await expect(nonZero.provider.completeVerification(account, "1111")).rejects.toMatchObject({ kind: "invalid_code" });
    const http401 = setup(() => json(401, unauthorizedBody));
    await expect(http401.provider.completeVerification(account, "1111")).rejects.toMatchObject({ kind: "invalid_code" });
  });

  it("normalizes the documented user/info example", async () => {
    const { provider } = setup(() =>
      json(200, {
        code: 0,
        data: {
          avatar: "https://wsrv.nl/?url=https%3A%2F%2Fakmpicture.youngjoygame.com%2Fdist%2Fface%2Fa.jpg",
          history_rank_level: 9999,
          level: 200,
          name: "SAYA AKAN LAWAN",
          rank_level: 8000,
          reg_country: "ID",
          roleId: 1234567890,
          zoneId: 123456,
        },
        msg: "ok",
      }),
    );
    await expect(provider.getPlayerProfile("jwt")).resolves.toEqual({
      roleId: 1234567890,
      zoneId: 123456,
      nickname: "SAYA AKAN LAWAN",
      avatarUrl: "https://akmpicture.youngjoygame.com/dist/face/a.jpg",
      level: 200,
      rankLevel: 8000,
      highestRankLevel: 9999,
      regCountry: "ID",
    });
  });

  it("maps an expired session (HTTP 401) to `unauthorized` for sync", async () => {
    const { provider } = setup(() => json(401, unauthorizedBody));
    await expect(provider.getPlayerProfile("expired")).rejects.toMatchObject({ kind: "unauthorized" });
  });
});

describe("helpers", () => {
  it("unwraps wsrv.nl image proxies and rejects non-https", () => {
    expect(unwrapImageUrl("https://wsrv.nl/?url=https%3A%2F%2Fakmweb.youngjoygame.com%2Fx.png")).toBe(
      "https://akmweb.youngjoygame.com/x.png",
    );
    expect(unwrapImageUrl("http://insecure.example.com/x.png")).toBeNull();
    expect(unwrapImageUrl("javascript:alert(1)")).toBeNull();
  });

  it("slugifies hero names", () => {
    expect(slugify("Yi Sun-shin")).toBe("yi-sun-shin");
    expect(slugify("Chang'e")).toBe("chang-e");
    expect(slugify("X.Borg")).toBe("x-borg");
  });
});
