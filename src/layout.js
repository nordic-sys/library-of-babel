// layout.js
// A könyvtár két elrendezése. A lapok és a címek ugyanazok — a cím ↔ lap leképezés független
// attól, hogyan osztjuk szét a könyveket —, csak a hely (hatszög, fal, polc, könyv) változik.
//
// - **borges**: a regény szerint falanként 5 polc, polconként 32 könyv (hatszögenként 640), és a
//   regény szerinti bejárás: a polcfalakon nincs ajtó, a hatszögek egy galériában, láncban állnak
//   (az egyik szabad oldal folyosóra nyílik, a másikon az előző folyosó érkezik), a folyosóban
//   csigalépcső visz fel és le. Valós méretű könyvekkel a polc csak annyi, amennyi könyv: a fal
//   közepén egy 5 polcos, kb. 2 m magas szekrény („alig magasabb egy könyvtárosnál”), a fal többi
//   része csupasz.
// - **dense** („telt falak”): a falak végig polccal borítva, a polcok tele
//   egész könyvekkel, a könyvek fölött ~5 cm hellyel. Az ajtó magasságáig 32 cm-enként osztott
//   sorok (az ajtó két oldalán), fölötte a mennyezetig teljes szélességű sorok. Mind a négy
//   polcfalon ajtó a szomszéd hatszögbe: a könyvtár térbeli rács (a mi kiegészítésünk).
//
// A polcok fentről lefelé számozódnak (1. a legfelső), mint a regény szerinti elrendezésben.
// Az aktuális elrendezés modulszintű állapot (`setLayout`), mert a hely-számítás sok tiszta
// függvényből hívódik; a React-fa a `LayoutContext`-tel értesül a váltásról.
import { createContext, useContext } from 'react';
import {
  BOARD_END, BOOK, BOOKS_PER_SHELF, DOOR_GAP, DOOR_H, FLOOR_H, TOP_LEN,
} from './geometry.js';

export const LAYOUTS = ['borges', 'dense'];
const LAYOUT_KEY = 'babel_layout';

const PITCH = 0.32; // sortáv a telt falon: 3 cm polclap + 24 cm könyv + 5 cm hely
const BOARD = 0.03;
/** Egy sor teteje (a fölötte lévő polclap vagy a fedlap közepe): a könyvek fölött 5 cm hely. */
export const rowCap = (row) => row.y + BOARD / 2 + BOOK.h + 0.05 + BOARD / 2;
/*
 * Egész könyvek egy polcszakaszon, 2 cm ráhagyással. Figyelem: az ajtó melletti szakaszon a 33.
 * könyvhöz 0,3 mm hiányzik (0,9437 m van, 0,9440 kellene) — a BOARD_END, a DOOR_GAP vagy a
 * könyvszélesség bármilyen apró változása 64-ről 66-ra állítaná a sort, és a „Telt falak” minden
 * helyét áttenné. A sorok könyvszámát a teszt rögzíti (104 × 3, 64 × 6).
 */
const fitting = (length) => Math.floor((length - 0.02) / BOOK.w + 1e-9);

/* Egy sor: { shelf, y (a polclap közepe), split (az ajtó két oldalán), count, len (egy szakasz hossza) }. */
function borgesRows() {
  // Egy szekrény a fal közepén, 5 polccal, 40 cm-enként; a teteje ~2 m.
  const rows = [];
  for (let shelf = 1; shelf <= 5; shelf++) {
    rows.push({ shelf, y: 0.12 + (5 - shelf) * 0.4, split: false, count: BOOKS_PER_SHELF, len: TOP_LEN });
  }
  return rows;
}

function denseRows() {
  const split = [];
  // A legalsó polclap a padló (a födém 10 cm-es) fölött; az osztott sorok könyvei az ajtó szemöldöke alatt.
  for (let y = 0.115; y + BOARD / 2 + BOOK.h + 0.03 <= DOOR_H; y += PITCH) split.push(y);
  const full = [];
  // Az ajtó fölötti sorok: az első polclap a szemöldök fölött, a legfelső fedlap a mennyezet alatt.
  for (let y = DOOR_H + 0.06; rowCap({ y }) + BOARD / 2 <= FLOOR_H + 1e-9; y += PITCH) full.push(y);
  const perSide = fitting(BOARD_END - DOOR_GAP / 2);
  const across = fitting(2 * BOARD_END);
  const top = full.reverse().map((y) => ({ y, split: false, count: across, len: across * BOOK.w + 0.02 }));
  const bottom = split.reverse().map((y) => ({ y, split: true, count: 2 * perSide, len: perSide * BOOK.w + 0.02 }));
  return [...top, ...bottom].map((r, i) => ({ ...r, shelf: i + 1 }));
}

const ROWS = { borges: borgesRows(), dense: denseRows() };

/**
 * A bejárás: `gallery` (Borges) — lánc a galéria mentén és lépcső, a polcfalakon nincs ajtó;
 * `lattice` (telt falak) — minden polcfalon ajtó, hat szomszéd egy szinten.
 */
export const topology = (id = current) => (id === 'borges' ? 'gallery' : 'lattice');
export const hasWallDoors = (id = current) => topology(id) === 'lattice';

let current = 'borges';
export const getLayout = () => current;
export function setLayout(id) {
  current = LAYOUTS.includes(id) ? id : 'borges';
}

export function readLayout() {
  try {
    const v = localStorage.getItem(LAYOUT_KEY);
    return LAYOUTS.includes(v) ? v : 'borges';
  } catch {
    return 'borges';
  }
}

export function saveLayout(id) {
  try {
    localStorage.setItem(LAYOUT_KEY, id);
  } catch {
    // A választás csak erre a látogatásra szól.
  }
}

/** Az elrendezés sorai, fentről lefelé. */
export const shelfRows = (id = current) => ROWS[id] ?? ROWS.borges;
export const shelvesPerWall = (id = current) => shelfRows(id).length;
export const booksPerWall = (id = current) => shelfRows(id).reduce((n, r) => n + r.count, 0);
export const booksPerHex = (id = current) => 4 * booksPerWall(id);
export const pagesPerHex = (id = current) => BigInt(booksPerHex(id) * 410);

/**
 * A v. kötet (1-től) vízszintes helye a fal közepétől egy soron. Osztott sorban az első fele az
 * ajtótól balra (az 1. a legtávolabb), a második fele jobbra; teljes sorban egy tömbben, középen.
 */
export function volumeX(shelf, vol, id = current) {
  const row = shelfRows(id)[shelf - 1];
  const i = vol - 1;
  if (!row.split) return (i - (row.count - 1) / 2) * BOOK.w;
  const half = row.count / 2;
  const side = i < half ? -1 : 1;
  const k = i < half ? half - 1 - i : i - half; // 0 az ajtó mellett
  return side * (DOOR_GAP / 2 + 0.01 + (k + 0.5) * BOOK.w); // 1 cm ráhagyás az ajtó felőli végen is
}

/** A polclap közepének magassága. */
export const rowY = (shelf, id = current) => shelfRows(id)[shelf - 1].y;

export const LayoutContext = createContext('borges');
export const useLayout = () => useContext(LayoutContext);
