// geometry.js
// A könyvtár méretei — egy helyen, mert a séta (`walk/`), az alaprajz (`HexPlan.jsx`) és a
// „Milyen messze van?” (`distance.js`) ugyanabban a térben jár.
//
// A felépítés (számolva):
// - A hatszög méretét a légakna szabja meg (akna + járóút + polcmélység), nem a könyvek; az akna
//   mérete rögzített.
// - **Valós méretű könyvek.** Borges könyve 410 oldal = 205 levél; 60–100 g/m²-es papíron és
//   kötéssel 2–3,5 cm vastag, a 40 sor × 80 jel 10–11 pontos betűvel kb. 17 × 24 cm-es lapot ad.
//   Itt 2,8 cm × 24 cm × 18 cm.
// - A polcok elrendezése és a bejárás a `layout.js`-ben: „Borges szerint” ép polcfalak, a fal
//   közepén egy 5 × 32 könyves szekrény, a hatszögek egy galériában (két szomszéd); „Telt falak”
//   padlótól mennyezetig polc, minden polcfal közepén könyvekkel keretezett ajtóval (hat szomszéd).
// - Itt csak a közös méretek vannak: hatszög, akna, folyosó, emelet, könyv, ajtó.

export const HEX_R = 3.4; // a hatszög oldala (= csúcssugara)
export const APOTHEM = HEX_R * Math.cos(Math.PI / 6);
export const SHAFT_R = 1.6; // a légakna sugara
export const SHELF_DEPTH = 0.34;
export const HALL_L = 2.4; // a folyosó (és az ajtó mögötti átjáró) hossza két hatszög között
export const HALL_W = 2.4;
/** Két szomszédos hatszög középpontjának távolsága, bármelyik irányban. */
export const HEX_STEP = 2 * APOTHEM + HALL_L;
export const FLOOR_H = 3.1; // egy emelet
export const STAIR_STEPS = 18; // a csigalépcső fokai emeletenként (egy teljes fordulat)
/** A két lámpa (Borges: kettő, keresztben) a hatszög közepéhez képest, a járógyűrű fölött. */
export const LAMP_Y = 2.72;
export const LAMP_Z = 2.15;

export const BOOKS_PER_SHELF = 32;
export const BOOK = { w: 0.028, h: 0.24, d: 0.18 };
/** A telt fal ajtó feletti első polclapjának magassága; ebből adódik az ajtó magassága. */
export const boardY = (shelf) => (shelf === 1 ? 2.12 : 0.12 + (5 - shelf) * 0.38);

/** Az ajtó a polcfal közepén; két oldalán a 2–5. polc szekrénye, fölötte az 1. polc. */
export const DOOR_W = 0.9;
export const DOOR_H = boardY(1) - 0.06;
export const DOOR_GAP = DOOR_W + 0.16; // az ajtó + a keret
/**
 * A polc legtávolabbi vége a fal közepétől: a szomszéd fal 120°-ban találkozik, a polc elején
 * (SHELF_DEPTH befelé) a fal belső fele R/2 − mélység/√3 — ennél beljebb kell érnie, hogy a két
 * sarokpolc ne lógjon egymásba.
 */
export const BOARD_END = HEX_R / 2 - SHELF_DEPTH / Math.sqrt(3) - 0.03;

/** Egy 32 kötetes polc hossza, 1–1 cm ráhagyással (Borges szerinti szekrény). */
export const TOP_LEN = BOOKS_PER_SHELF * BOOK.w + 0.02;
