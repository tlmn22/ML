import { ProviderError, type MlbbProvider } from "../provider";
import type {
  GameAccountId,
  HeroDetail,
  HeroStatistic,
  HeroSummary,
  ItemCategory,
  ItemDetail,
  PlayerProfile,
  ProviderSession,
} from "../types";
import { RoneArenaClient } from "./client";
import {
  envelopeSchema,
  heroDetailRecordSchema,
  heroListRecordSchema,
  itemRecordSchema,
  heroRankRecordSchema,
  loginDataSchema,
  pagedSchema,
  userInfoDataSchema,
} from "./schemas";
import { z } from "zod";

const loginResponseSchema = envelopeSchema.extend({ data: z.unknown() });
const userInfoResponseSchema = envelopeSchema.extend({ data: z.unknown() });

/** Rone Arena routes images through wsrv.nl; we keep the original URL and let Next optimize it. */
export function unwrapImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "wsrv.nl") {
      const inner = parsed.searchParams.get("url");
      return inner && inner.startsWith("https://") ? inner : null;
    }
    return parsed.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

export function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const ITEM_CATEGORIES: Record<string, ItemCategory> = {
  "0": "attack",
  "1": "magic",
  "2": "defense",
  "3": "movement",
  "4": "jungle",
  "5": "roam",
};

/** "+160 Extra Physical Attack<br>+15Physical Penetration<br>" → ["+160 Extra Physical Attack", "+15 Physical Penetration"] */
export function parseItemStats(tips: string | null | undefined): string[] {
  return (tips ?? "")
    .split(/<br\s*\/?>/i)
    .map((line) => line.trim().replace(/^([+-][\d.]+%?)(?=[A-Za-z])/, "$1 "))
    .filter(Boolean);
}

export class RoneArenaProvider implements MlbbProvider {
  readonly name = "rone-arena";
  readonly dataSource = "provider" as const;

  constructor(private readonly client: RoneArenaClient) {}

  async requestVerificationCode(account: GameAccountId): Promise<void> {
    const res = await this.client.request({
      method: "POST",
      path: "/user/auth/send-vc",
      body: { role_id: account.roleId, zone_id: account.zoneId },
      schema: envelopeSchema,
      retry: false,
    });
    if (res.code !== 0) {
      throw new ProviderError("invalid_input", `send-vc rejected: code ${res.code} ${res.msg ?? res.message ?? ""}`);
    }
  }

  async completeVerification(account: GameAccountId, code: string): Promise<ProviderSession> {
    let res: z.output<typeof loginResponseSchema>;
    try {
      res = await this.client.request({
        method: "POST",
        path: "/user/auth/login",
        body: { role_id: account.roleId, zone_id: account.zoneId, vc: Number(code) },
        schema: loginResponseSchema,
        retry: false,
      });
    } catch (error) {
      // At login, an auth rejection means the code was wrong or expired.
      if (error instanceof ProviderError && error.kind === "unauthorized") {
        throw new ProviderError("invalid_code", error.message, { status: error.status, cause: error });
      }
      throw error;
    }

    if (res.code !== 0) {
      throw new ProviderError("invalid_code", `login rejected: code ${res.code} ${res.msg ?? res.message ?? ""}`);
    }
    const data = loginDataSchema.safeParse(res.data);
    if (!data.success) {
      throw new ProviderError("invalid_response", "login response missing jwt/roleid/zoneid", { cause: data.error });
    }
    return { token: data.data.jwt, roleId: data.data.roleid, zoneId: data.data.zoneid };
  }

  async getPlayerProfile(token: string): Promise<PlayerProfile> {
    const res = await this.client.request({
      path: "/user/info",
      query: { lang: "en" },
      token,
      schema: userInfoResponseSchema,
    });
    if (res.code !== 0) {
      // Only HTTP 401 is a confirmed "session invalid" signal; don't drop sessions on other codes.
      throw new ProviderError("unknown", `user/info rejected: code ${res.code} ${res.msg ?? res.message ?? ""}`);
    }
    const data = userInfoDataSchema.safeParse(res.data);
    if (!data.success) {
      throw new ProviderError("invalid_response", "user/info response missing roleId/zoneId", { cause: data.error });
    }
    const d = data.data;
    return {
      roleId: d.roleId,
      zoneId: d.zoneId,
      nickname: d.name,
      avatarUrl: unwrapImageUrl(d.avatar),
      level: d.level ?? null,
      rankLevel: d.rank_level ?? null,
      highestRankLevel: d.history_rank_level ?? null,
      regCountry: d.reg_country,
    };
  }

  async endSession(token: string): Promise<void> {
    await this.client.request({
      method: "POST",
      path: "/user/auth/logout",
      token,
      schema: envelopeSchema,
      retry: false,
    });
  }

  async listHeroes(): Promise<HeroSummary[]> {
    const res = await this.client.request({
      path: "/heroes",
      query: { size: 300, index: 1, lang: "en" },
      schema: pagedSchema(heroListRecordSchema),
      revalidate: 6 * 3600,
    });
    return res.data.records.map(({ data }) => ({
      id: data.hero_id,
      name: data.hero.data.name,
      slug: slugify(data.hero.data.name) || `hero-${data.hero_id}`,
      headImageUrl: unwrapImageUrl(data.hero.data.head),
      relations: {
        strong: data.relation?.strong?.target_hero_id ?? [],
        weak: data.relation?.weak?.target_hero_id ?? [],
        assist: data.relation?.assist?.target_hero_id ?? [],
      },
    }));
  }

  async getHeroDetail(heroId: number): Promise<HeroDetail> {
    const res = await this.client.request({
      path: `/heroes/${heroId}`,
      query: { lang: "en" },
      schema: pagedSchema(heroDetailRecordSchema),
      revalidate: 6 * 3600,
    });
    const record = res.data.records[0];
    if (!record) throw new ProviderError("invalid_response", `hero ${heroId} not found`);
    const hero = record.data.hero.data;
    const skills = (hero.heroskilllist[0]?.skilllist ?? []).map((s, index) => {
      const cdCost = s["skillcd&cost"]?.trim() || null;
      return {
        id: s.skillid,
        name: s.skillname.trim(),
        cdCost,
        tags: (s.skilltag ?? []).map((t) => t.tagname),
        description: s.skilldesc.trim(),
        iconUrl: unwrapImageUrl(s.skillicon),
        // The provider lists the passive first, without a cooldown.
        isPassive: index === 0 && !cdCost,
      };
    });
    return {
      id: record.data.hero_id,
      name: hero.name,
      slug: slugify(hero.name) || `hero-${record.data.hero_id}`,
      roles: hero.sortlabel,
      lanes: hero.roadsortlabel,
      specialities: hero.speciality,
      story: hero.story?.trim() || null,
      headImageUrl: unwrapImageUrl(hero.head ?? record.data.head),
      portraitUrl: unwrapImageUrl(hero.squareheadbig ?? hero.painting),
      skills,
    };
  }

  async listItems(): Promise<ItemDetail[]> {
    const res = await this.client.request({
      path: "/academy/equipment/expanded",
      query: { size: 500, index: 1, lang: "en" },
      schema: pagedSchema(itemRecordSchema),
      revalidate: 6 * 3600,
    });
    return res.data.records.map(({ data }) => ({
      id: data.equipid,
      name: data.equipname.trim(),
      category: ITEM_CATEGORIES[data.equiptype ?? ""] ?? null,
      iconUrl: unwrapImageUrl(data.equipicon),
      stats: parseItemStats(data.equiptips),
      passive: data.equipskilldesc?.trim() || null,
    }));
  }

  async getHeroStatistics({ days, rank }: { days: 1 | 3 | 7 | 15 | 30; rank: string }): Promise<HeroStatistic[]> {
    const res = await this.client.request({
      path: "/heroes/rank",
      query: { days, rank, size: 300, index: 1, lang: "en", sort_field: "win_rate", sort_order: "desc" },
      schema: pagedSchema(heroRankRecordSchema),
      revalidate: 3600,
    });
    return res.data.records.map(({ data }) => ({
      heroId: data.main_heroid,
      winRate: data.main_hero_win_rate ?? null,
      pickRate: data.main_hero_appearance_rate ?? null,
      banRate: data.main_hero_ban_rate ?? null,
    }));
  }
}
