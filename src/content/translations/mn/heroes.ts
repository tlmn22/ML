import type { HeroTranslation } from "../types";

/**
 * Mongolian hero texts. Status: AI draft (Claude, 2026-11-06), awaiting human review.
 * Source: Rone Arena /api/heroes/{id}?lang=en. Game terms stay in English on purpose.
 */
export const heroTranslationsMn: Record<number, HeroTranslation> = {
  // Miya
  1: {
    review: "ai_draft",
    story: { sourceHash: "4b1422089c274297", text: `Сарны тахилч, Сарны гэрэлт ойн хамгаалагч.` },
    skills: {
      140: {
        sourceHash: "0a2e7245ae40753e",
        text: `Miya-гийн Basic Attack бай онох бүрд тэрээр 4 секундийн турш 5% Attack Speed авна (хамгийн ихдээ 5 stack).\n\nStack дүүрсэн үед Basic Attack бүр нэмэлтээр <font color="a6aafb">Moonlight Shadow</font> дуудаж байг довтлуулна. Энэ нь 25<font color="fba51f"> (+20% Total Physical Attack)</font> <font color="fb1f1f">Physical Damage</font> учруулж, Attack Effect-ийн 20%-ийг өвлөнө.`,
      },
      110: {
        sourceHash: "4898c2f5d5846f9c",
        text: `Miya-гийн Basic Attack нэмэлт 2 <font color="a6aafb">Split Arrows</font> харвана. Сум бүр Attack Effect-ийн 30%-ийг өвлөнө. Үндсэн байд 10<font color="fba51f"> (+100% Total Physical Attack)</font> <font color="fb1f1f">Physical Damage</font>, бусад байд 30% damage учруулна.\n\nЭнэ нөлөө 4 секунд үргэлжилнэ.`,
      },
      120: {
        sourceHash: "c165ebd02a9104dc",
        text: `Miya зорилтот талбайд <font color="a6aafb">Moon Eclipse</font>-ийн хүчийг дуудаж, доторх дайснуудад 270<font color="fba51f"> (+45% Total Physical Attack)</font> <font color="fb1f1f">Physical Damage</font> учруулан 1.2 секунд хөдөлгөөнгүй болгоно (immobilize).\n\nДараа нь довтолгоо янз бүрийн чиглэлд тархах 6 сум болж хуваагдана. Сум бүр 40<font color="fba51f"> (+20% Total Physical Attack)</font> <font color="fb1f1f">Physical Damage</font> учруулж, онох дайсныг 2 секундийн турш 30% удаашруулна.`,
      },
      130: {
        sourceHash: "b99122d7be2bd1a8",
        text: `Miya бүх debuff-аа арилгаж <font color="a6aafb">Conceal</font> төлөвт орон, 2 секунд хүртэл 65% Movement Speed авна (довтолбол төлөв эрт дуусна).\n\n<font color="a6aafb">Conceal</font> төлөвөөс гарахад Miya <font color="a6aafb">Moon Blessing</font>-ийн хамгийн их stack-ийг шууд авна.`,
      },
    },
  },

  // Tigreal
  6: {
    review: "ai_draft",
    story: { sourceHash: "5dc26b2c4ec567a5", text: `Light's Order-ийн удирдагч, Moniyan эзэнт гүрний хамгаалагч.` },
    skills: {
      640: {
        sourceHash: "f6d3c26493040c06",
        text: `Tigreal Basic Attack-д өртөх бүртээ 1 stack <font color="a6aafb">Fearless</font> авна. 4 stack хүрэхэд тэдгээрийг зарцуулж дараагийн Basic Attack-ийг хаана (Turret-ийн довтолгоог оролцуулан).\nМөн skill хэрэглэх бүртээ 1 stack <font color="a6aafb">Fearless</font> авна.\n\nMinion-ий учруулсан damage <font color="a6aafb">Fearless</font> stack нэмэхгүй, зарцуулахгүй.`,
      },
      610: {
        sourceHash: "2f3f6468ab37cac1",
        text: `Tigreal алхаараа газар цохиж, сэнс хэлбэрийн талбайд 3 удаа дэлбэрэх цохилтын долгион илгээнэ. Дэлбэрэлт бүр өртсөн дайснуудад 270<font color="fba51f"> (+70% Total Physical Attack)</font> <font color="fb1f1f">Physical Damage</font> учруулж, 1.5 секундийн турш 20% / 40% / 60% удаашруулна.`,
      },
      620: {
        sourceHash: "04e69fb037f4989a",
        text: `Tigreal зорилтот чиглэлд давхин орж, замдаа таарсан дайснуудад <font color="fba51f"> (+100% Total Physical Attack)</font> <font color="fb1f1f">Physical Damage</font> учруулан тэднийг давхилтын төгсгөл хүртэл түлхэнэ.\n\n<font color="a6aafb">Use Again</font>: 4 секундийн дотор skill-ийг дахин хэрэглэж, урдах дайснуудад 280<font color="fba51f"> (+60% Total Physical Attack)</font> <font color="fb1f1f">Physical Damage</font> учруулан 0.6 секунд агаарт шидэнэ (airborne).`,
      },
      630: {
        sourceHash: "6af82788746c6763",
        text: `Tigreal алхныхаа хүчийг гаргаж, ойролцоох дайснуудыг өөр рүүгээ татан 600<font color="fba51f"> (+130% Total Physical Attack)</font> <font color="fb1f1f">Physical Damage</font> учруулж, 1.8 секунд stun хийнэ.\n\nChannel-ийн эхний хагасыг control effect тасалж болох бол хоёр дахь хагасыг зөвхөн <font color="a6aafb">Suppression</font> тасална.`,
      },
    },
  },

  // Alucard
  7: {
    review: "ai_draft",
    story: { sourceHash: "8a7509a1bc46c937", text: `Харанхуйг үзэн яддаг чөтгөрийн анчин.` },
    skills: {
      740: {
        sourceHash: "8e943e45c73bd441",
        text: `Skill хэрэглэх бүрийн дараа Alucard-ийн дараагийн Basic Attack түүнийг бай руу ухасхийлгэж <font color="fba51f"> (+125% Total Physical Attack)</font> <font color="fb1f1f">Physical Damage</font> учруулна.\n\n<font color="a6aafb">Demon Hunter</font>: Alucard creep-д 110% damage учруулна.`,
      },
      710: {
        sourceHash: "9f7b5c83037617a4",
        text: `Alucard зорилтот талбай руу үсрэн цавчиж, талбай доторх дайснуудад 270<font color="fba51f"> (+85% Extra Physical Attack)</font> <font color="fb1f1f">Physical Damage</font> учруулан 2 секундийн турш 40% удаашруулна.`,
      },
      720: {
        sourceHash: "0f9c2057c765c61b",
        text: `Alucard эргэлдэх цавчилт хийж, ойролцоох дайснуудад 345<font color="fba51f"> (+120% Extra Physical Attack)</font> <font color="fb1f1f">Physical Damage</font> учруулна.`,
      },
      730: {
        sourceHash: "0316dba45f59bb10",
        text: `<font color="a6aafb">Passive</font>: Alucard байнгын 10% Hybrid Lifesteal авна.\n\n<font color="a6aafb">Active</font>: Alucard зорилтот талбай дахь дайснуудын энергийг шингээж, тэдний Movement Speed-ийг 30%, <font color="26e407"><1999></font>-ийг 10-аар бууруулна. Өртсөн дайсны hero бүрээс 10 <font color="26e407"><1999></font> авч, бусад skill-ийнхээ cooldown-ыг 6 секундийн турш 50% болгоно.\n\n<font color="a6aafb">Use Again</font>: Alucard урагш хүчтэй долгион цацаж 400<font color="fba51f"> (+200% Extra Physical Attack)</font> <font color="fb1f1f">Physical Damage</font> учруулна.`,
      },
    },
  },

  // Eudora
  15: {
    review: "ai_draft",
    story: {
      sourceHash: "a9046fe934cfe6e2",
      text: `Хурууныхаа үзүүрээр аянга захирч, өрөөсгөл үзлийг нэвт цохин, ирэх замыг гэрэлтүүлдэг элф шидтэн.`,
    },
    skills: {
      1540: {
        sourceHash: "465c83f1f46d3eeb",
        text: `Eudora-гийн skill онох minion бус байд 5 секундийн турш <font color="a6aafb">Superconductor</font> тавьж, <font color="a6aafb">Superconductor</font>-той дайснуудад нэмэлт нөлөө үүсгэж чадна.`,
      },
      1510: {
        sourceHash: "5324cfce94b16ab1",
        text: `Eudora сэнс хэлбэрийн талбайд Forked Lightning цацаж, доторх дайснуудад 275<font color="62f8fe"> (+100% Total Magic Power)</font> <font color="7f62fe">Magic Damage</font> учруулна (minion-д 200% хүртэл өснө).\n\n<font color="a6aafb">Superconductor</font>-той байг онох үед Eudora бай руу аянгын гинж үүсгэж, гинж үргэлжлэх хугацаанд 1 секунд хүртэл 40% Movement Speed авна.\nАянгын гинж хугацааны турш 10<font color="62f8fe"> (+4% Total Magic Power)</font> <font color="7f62fe">Magic Damage</font>, дуусахдаа нэмэлт 275<font color="62f8fe"> (+100% Total Magic Power)</font> <font color="7f62fe">Magic Damage</font> учруулна. Энэ цохилт онвол skill-ийн cooldown 50%-иар багасна.`,
      },
      1520: {
        sourceHash: "bad9c3d01d285efe",
        text: `Eudora зорилтот дайсан руу аянгын бөмбөлөг шидэж, 1.8 секундийн турш <font color="62f8fe"><1070></font>-ийг 10-аар бууруулж, 300<font color="62f8fe"> (+50% Total Magic Power)</font> <font color="7f62fe">Magic Damage</font> учруулан 1 секунд stun хийнэ.\n\nХэрэв бай <font color="a6aafb">Superconductor</font>-той бол бөмбөлөг ойролцоох дайснуудын <font color="62f8fe"><1070></font>-ийг бууруулж, байг төв болгон AOE damage учруулж, ойролцоох бүх дайсныг stun хийнэ.`,
      },
      1530: {
        sourceHash: "9868fcfc9707cb88",
        text: `Eudora зорилтот талбай руу аянга буулгаж, төвд байгаа байнуудад 600<font color="62f8fe"> (+160% Total Magic Power)</font> <font color="7f62fe">Magic Damage</font> учруулна. Дараа нь төвөөс гаднах байнуудыг цохиж 300<font color="62f8fe"> (+100% Total Magic Power)</font> <font color="7f62fe">Magic Damage</font> учруулна.\n\nThunder's Wrath <font color="a6aafb">Superconductor</font>-той байг онох бүрд богино хугацааны дараа тэр <font color="a6aafb">Superconductor</font> байг төв болгон <font color="a6aafb">Thunderburst</font> үүсч, 330<font color="62f8fe"> (+110% Total Magic Power)</font> <font color="7f62fe">Magic Damage</font> учруулна.`,
      },
    },
  },

  // Fanny
  17: {
    review: "ai_draft",
    story: { sourceHash: "22fe2f9b32afe7a9", text: `Тулааны талбарын ирт бүжигчин.` },
    skills: {
      1740: {
        sourceHash: "736114ded9a4aa39",
        text: `Нисэж байх үедээ Fanny онох дайснуудад 10%-20% нэмэлт damage учруулж (нислэгийн хурдаас хамаарна), довтолгоо бүрдээ <font color="a6aafb">Prey Mark</font>-ийн stack тавина (хамгийн ихдээ 2 stack). Тэмдэглэгдсэн дайсны hero-г дараа нь skill-ээр онох бүрд stack тутамд 8 energy нөхөгдөнө. Богино хугацаанд олон дайсны hero онох тохиолдолд energy нөхөлт буурна.`,
      },
      1710: {
        sourceHash: "d2c29054de38b0d0",
        text: `Fanny ирээ эргүүлж, ойролцоох дайснуудад 275<font color="fba51f"> (+85% Total Physical Attack)</font> <font color="fb1f1f">Physical Damage</font> учруулна.`,
      },
      1720: {
        sourceHash: "1507fc575e88c1f8",
        text: `Fanny зорилтот чиглэлд олс харваж, анх тулсан саад руу өөрийгөө татна. 2 секундийн дотор energy дуустал skill-ийг дахин хэрэглэж болох бөгөөд энэ хугацаанд дараалсан хэрэглээ бүр 2-оор бага energy зарцуулна.\n\nНисэж явахдаа дайсан онох үед energy хүрэлцэж байвал Fanny автоматаар <font color="a6aafb">Tornado Strike</font> хэрэглэнэ.`,
      },
      1730: {
        sourceHash: "56039f35bf8d908d",
        text: `Fanny зорилтот дайсны hero эсвэл Creep рүү ирээрээ харайн 400<font color="fba51f"> (+200% Extra Physical Attack)</font> <font color="fb1f1f">Physical Damage</font> учруулна. Бай дээрх <font color="a6aafb">Prey Mark</font>-ийн stack бүр энэ damage-ийг 30%-иар нэмэгдүүлнэ.`,
      },
    },
  },
};
