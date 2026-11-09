import type { ItemTranslation } from "../types";

/**
 * Mongolian item passives. Status: AI draft (Claude, 2026-11-06), awaiting human review.
 * Source: Rone Arena /api/academy/equipment/expanded?lang=en. Passive names stay in English.
 */
export const itemTranslationsMn: Record<number, ItemTranslation> = {
  // Blade of Despair
  3008: {
    review: "ai_draft",
    passive: {
      sourceHash: "c990e0a503fb1cc6",
      text: `Despair: HP нь 50%-иас доош minion бус дайсанд damage учруулахад 2 секундийн турш Physical Attack 25%-иар нэмэгдэнэ (damage учрахаас өмнө үйлчилнэ).`,
    },
  },
  // Windtalker
  3005: {
    review: "ai_draft",
    passive: {
      sourceHash: "be439a6d9e71ca03",
      text: `Typhoon: 5-2 секунд тутамд (Basic Attack бүр 0.2 секундээр богиносгоно) дараагийн Basic Attack 3 хүртэлх дайсны unit-д 150-362 Magic Damage учруулна. (Энэ довтолгоо Crit хийж болох бөгөөд minion-д damage 200% хүртэл өснө.)`,
    },
  },
  // Holy Crystal
  3102: {
    review: "ai_draft",
    passive: {
      sourceHash: "280c484186b8986d",
      text: `Mystery: 21%-35% нэмэлт Magic Power авна (level-ээс хамаарна).`,
    },
  },
  // Athena's Shield
  3205: {
    review: "ai_draft",
    passive: {
      sourceHash: "c1452adaae9ff517",
      text: `Shield: Дайсны hero-гийн skill эсвэл Basic Attack-аас Magic Damage авах үед 3 секундийн турш авах Magic Damage 25%-иар буурна (нөлөөг идэвхжүүлсэн damage-ийг оролцуулан). Тулаанаас гарснаас хойш 5 секундийн дараа нөлөө дахин сэргэнэ.`,
    },
  },
  // Immortality
  3207: {
    review: "ai_draft",
    passive: {
      sourceHash: "aa14c1375eb2ed61",
      text: `Immortal: Үхсэнээс хойш 2.5 секундийн дараа амилж, 16% HP болон 150(+70*Hero Level) damage шингээх shield авна. Shield 3 секунд үргэлжилнэ. Энэ нөлөө 210 секундийн cooldown-той.`,
    },
  },
};
