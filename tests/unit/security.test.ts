import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, hashIp } from "@/lib/security/crypto";
import { isSameOrigin } from "@/lib/security/request";
import { createMlbbProvider } from "@/lib/mlbb";

const key = randomBytes(32).toString("base64");

describe("token encryption", () => {
  it("round-trips and never contains the plaintext", () => {
    const secret = "eyJhbGciOiJIUzI1NiJ9.payload.signature";
    const sealed = encryptSecret(secret, key);
    expect(sealed).not.toContain("payload");
    expect(sealed.startsWith("v1:")).toBe(true);
    expect(decryptSecret(sealed, key)).toBe(secret);
  });

  it("uses a fresh IV each time", () => {
    expect(encryptSecret("same", key)).not.toBe(encryptSecret("same", key));
  });

  it("rejects tampering and wrong keys", () => {
    const sealed = encryptSecret("secret", key);
    const parts = sealed.split(":");
    parts[3] = Buffer.from("tampered").toString("base64");
    expect(() => decryptSecret(parts.join(":"), key)).toThrow();
    expect(() => decryptSecret(sealed, randomBytes(32).toString("base64"))).toThrow();
  });
});

describe("request helpers", () => {
  it("hashes IPs with a salt and passes null through", () => {
    expect(hashIp("1.2.3.4", "salt-a")).not.toBe(hashIp("1.2.3.4", "salt-b"));
    expect(hashIp(null, "salt")).toBeNull();
  });

  it("accepts only same-origin requests", () => {
    const req = (origin?: string) =>
      new Request("https://mlmongolia.mn/api/x", { method: "POST", headers: origin ? { origin } : {} });
    expect(isSameOrigin(req("https://mlmongolia.mn"), "https://mlmongolia.mn")).toBe(true);
    expect(isSameOrigin(req("https://evil.example"), "https://mlmongolia.mn")).toBe(false);
    expect(isSameOrigin(req(), "https://mlmongolia.mn")).toBe(false);
  });
});

describe("provider factory", () => {
  const base = {
    RONE_ARENA_BASE_URL: "https://arena.rone.dev",
    RONE_ARENA_ALLOWED_HOSTS: ["arena.rone.dev"],
    RONE_ARENA_TIMEOUT_MS: 8000,
  };
  it("refuses the mock provider in production", () => {
    expect(() => createMlbbProvider({ ...base, MLBB_PROVIDER: "mock", VERCEL_ENV: "production" })).toThrow(/not allowed/);
  });
  it("tags mock data as mock", () => {
    expect(createMlbbProvider({ ...base, MLBB_PROVIDER: "mock", VERCEL_ENV: "preview" }).dataSource).toBe("mock");
    expect(createMlbbProvider({ ...base, MLBB_PROVIDER: "rone_arena", VERCEL_ENV: "production" }).dataSource).toBe("provider");
  });
});
