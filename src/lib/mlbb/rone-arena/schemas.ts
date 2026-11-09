import { z } from "zod";

/**
 * Zod schemas for Rone Arena responses (API 1.6.2). Unknown fields are allowed;
 * fields we rely on are required. Shapes follow the OpenAPI schema and live
 * responses captured on 2026-11-05. User endpoints are documented but have not
 * been observed with a real authenticated account yet — see docs/API_FEASIBILITY.md.
 */

const intLike = z.union([z.number().int(), z.string().regex(/^-?\d+$/).transform(Number)]);
const optionalString = z.string().nullish().transform((v) => (v ? v : null));

export const envelopeSchema = z.looseObject({
  code: z.number().int(),
  msg: z.string().nullish(),
  message: z.string().nullish(),
});

export const errorBodySchema = z.looseObject({
  status: z.literal("error"),
  code: z.string(),
  message: z.string().nullish(),
  alternative_endpoint: z.string().nullish(),
});

export const loginDataSchema = z.looseObject({
  jwt: z.string().min(1),
  roleid: intLike,
  zoneid: intLike,
});

export const userInfoDataSchema = z.looseObject({
  roleId: intLike,
  zoneId: intLike,
  name: optionalString,
  avatar: optionalString,
  level: intLike.nullish(),
  rank_level: intLike.nullish(),
  history_rank_level: intLike.nullish(),
  reg_country: optionalString,
});

export const heroListRecordSchema = z.looseObject({
  data: z.looseObject({
    hero_id: z.number().int(),
    hero: z.looseObject({
      data: z.looseObject({
        name: z.string().min(1),
        head: z.string().nullish(),
      }),
    }),
    relation: z
      .looseObject({
        strong: z.looseObject({ target_hero_id: z.array(z.number().int()) }).nullish(),
        weak: z.looseObject({ target_hero_id: z.array(z.number().int()) }).nullish(),
        assist: z.looseObject({ target_hero_id: z.array(z.number().int()) }).nullish(),
      })
      .nullish(),
  }),
});

export const heroRankRecordSchema = z.looseObject({
  data: z.looseObject({
    main_heroid: z.number().int(),
    main_hero_win_rate: z.number().min(0).max(1).nullish(),
    main_hero_appearance_rate: z.number().min(0).max(1).nullish(),
    main_hero_ban_rate: z.number().min(0).max(1).nullish(),
  }),
});

export const pagedSchema = <T extends z.ZodType>(record: T) =>
  z.looseObject({
    code: z.number().int(),
    data: z.looseObject({
      records: z.array(record),
      total: z.number().int().nullish(),
    }),
  });

const labelList = z.array(z.string().nullish()).nullish().transform((v) => (v ?? []).filter((s): s is string => !!s));

export const heroDetailRecordSchema = z.looseObject({
  data: z.looseObject({
    hero_id: z.number().int(),
    head: z.string().nullish(),
    hero: z.looseObject({
      data: z.looseObject({
        name: z.string().min(1),
        head: z.string().nullish(),
        squareheadbig: z.string().nullish(),
        painting: z.string().nullish(),
        story: z.string().nullish(),
        sortlabel: labelList,
        roadsortlabel: labelList,
        speciality: labelList,
        heroskilllist: z.array(
          z.looseObject({
            skilllist: z.array(
              z.looseObject({
                skillid: z.number().int(),
                skillname: z.string(),
                skilldesc: z.string(),
                "skillcd&cost": z.string().nullish(),
                skillicon: z.string().nullish(),
                skilltag: z.array(z.looseObject({ tagname: z.string() })).nullish(),
              }),
            ),
          }),
        ),
      }),
    }),
  }),
});

export const itemRecordSchema = z.looseObject({
  data: z.looseObject({
    equipid: z.number().int(),
    equipname: z.string().min(1),
    equipicon: z.string().nullish(),
    equiptype: z.string().nullish(),
    equiptips: z.string().nullish(),
    equipskilldesc: z.string().nullish(),
  }),
});
