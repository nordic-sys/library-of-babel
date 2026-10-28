// location.js
// Hol áll egy oldal: a cím → hatszög/fal/polc/kötet/oldal bontás, a hely egyetlen írásmódja,
// a könyv oldalpárjai (bal = páros, jobb = páratlan) és a lapozó-feliratok. Minden felület
// innen veszi a helyet, hogy ugyanaz a hely mindenhol ugyanúgy legyen leírva.
import { N } from './core.js';
import { booksPerWall, getLayout, shelfRows } from './layout.js';

export const PAGES = 410;
export const LINE_LENGTH = 80;
export const LINES = 40;

/**
 * A cím helye: oldal (410-esével), könyv, polc, fal, hatszög. A könyvek száma polconként az
 * elrendezéstől függ (`layout.js`); a lap és a cím ettől független.
 */
export function calculateHierarchy(addr, layout = getLayout()) {
  const page = addr % 410n;
  const book = addr / 410n;
  const perWall = BigInt(booksPerWall(layout));
  const perHex = 4n * perWall;
  const hex = book / perHex;
  const inHex = book % perHex;
  const wall = inHex / perWall;
  let rest = Number(inHex % perWall);
  let shelf = 0;
  const rows = shelfRows(layout);
  while (rest >= rows[shelf].count) {
    rest -= rows[shelf].count;
    shelf++;
  }
  return {
    page: Number(page) + 1,
    vol: rest + 1,
    shelf: shelf + 1,
    wall: Number(wall) + 1,
    hex: hex.toString(36),
  };
}

/** A hatszög rövid neve. Rövid azonosítónál (pl. a 0. címnél) nincs kihagyásjel. */
export function hexLabel(h) {
  return h.hex.length > 8 ? `${h.hex.slice(0, 8)}…` : h.hex;
}

/*
 * A hely szavai nyelvenként. A magyar alak „4. fal”: a sorszám a szó előtt áll, így soha nem kell
 * a számot ragozni (nincs „a/az”, nincs „-on/-en/-ön”), ami számjegyekkel megbízhatatlan volna.
 */
const UNIT = {
  en: { wall: (n) => `wall ${n}`, shelf: (n) => `shelf ${n}`, book: (n) => `book ${n}`, page: (n) => `page ${n}`, pages: (a, b) => `pages ${a}–${b}` },
  hu: { wall: (n) => `${n}. fal`, shelf: (n) => `${n}. polc`, book: (n) => `${n}. könyv`, page: (n) => `${n}. oldal`, pages: (a, b) => `${a}–${b}. oldal` },
};
const unit = (lang) => UNIT[lang] ?? UNIT.en;

/** „wall 4 · shelf 4 · book 24 · page 88” — a hatszög nélkül, mert azt monóval szedjük. */
export function placeText(h, { page = true, lang = 'en' } = {}) {
  const u = unit(lang);
  const parts = [u.wall(h.wall), u.shelf(h.shelf), u.book(h.vol)];
  if (page) parts.push(u.page(h.page));
  return parts.join(' · ');
}

/** A futófej: bal lapon fal és polc, jobb lapon a könyv. */
export function runningHead(h, side, lang = 'en') {
  const u = unit(lang);
  return side === 'left' ? `${u.wall(h.wall)} · ${u.shelf(h.shelf)}` : u.book(h.vol);
}

export function pageWord(n, lang = 'en') {
  return unit(lang).page(n);
}

export function bookWord(n, lang = 'en') {
  return unit(lang).book(n);
}

/** Egy sorban, sima szövegként (pl. aria-label, régi könyvjelző). */
export function locationText(h, opts) {
  return `${hexLabel(h)} · ${placeText(h, opts)}`;
}

export function pageOf(addr) {
  return Number(addr % 410n) + 1;
}

function wrap(addr) {
  if (addr < 0n) return N - 1n;
  if (addr >= N) return 0n;
  return addr;
}

/**
 * A címhez tartozó nyitott oldalpár. Páros oldal balra (verso), páratlan jobbra (recto);
 * az 1. oldal mellett bal felől az előzéklap áll, a 410. mellett jobb felől a hátsó.
 * A könyvtár utolsó kötete nem teljes (32^3200 mod 410 = 206), ott is üres lap jön.
 */
export function spreadOf(addr) {
  const p = pageOf(addr);
  if (p % 2 === 0) {
    const right = p < PAGES && addr + 1n < N ? addr + 1n : null;
    return { left: addr, right };
  }
  return { left: p > 1 ? addr - 1n : null, right: addr };
}

/** A látható lapok: kétoldalas nézetben a pár, egyoldalasban maga a lap. */
export function shownPages(addr, twoPage) {
  if (!twoPage) return [addr];
  const { left, right } = spreadOf(addr);
  return [left, right].filter((a) => a !== null);
}

/** Lapozás: a következő nézet első lapja, illetve az előző nézet utolsó lapja (körbefordulással). */
export function turnTarget(addr, dir, twoPage) {
  const pages = shownPages(addr, twoPage);
  return dir > 0 ? wrap(pages[pages.length - 1] + 1n) : wrap(pages[0] - 1n);
}

/** „pages 88–89” / „page 89” — a látható lapok együtt. */
export function pagesPhrase(addr, twoPage, lang = 'en') {
  const u = unit(lang);
  const pages = shownPages(addr, twoPage).map(pageOf);
  return pages.length === 2 ? u.pages(pages[0], pages[1]) : u.page(pages[0]);
}

const EDGE = {
  en: {
    toZero: 'address 0, page 1',
    toLast: 'the last page of the library',
    hex: (dir, phrase) => `${dir > 0 ? 'the next' : 'the previous'} hexagon, ${phrase}`,
    end: 'There is no page after this one. Turning on brings you back to address 0 — the library is unlimited and periodic.',
    lastOfBook: (v) => `Page 410 is the last page of book ${v}. Turning on opens the next book, at its first page.`,
  },
  hu: {
    toZero: 'a nullás cím, 1. oldal',
    toLast: 'a könyvtár utolsó lapja',
    hex: (dir, phrase) => `${dir > 0 ? 'a következő' : 'az előző'} hatszög, ${phrase}`,
    end: 'Ez a könyvtár utolsó lapja. Ha továbblapozol, visszajutsz a nullás címhez — a könyvtár „határtalan és periodikus”.',
    lastOfBook: (v) => `Ez a könyv utolsó oldala (${v}. könyv, 410. oldal). Ha továbblapozol, a következő könyv nyílik ki, az elején.`,
  },
};
const edge = (lang) => EDGE[lang] ?? EDGE.en;

/**
 * A lapozó felirata: a szomszéd nézet a saját helyéből számolva. Kötethatáron megnevezi a
 * kötetet, polc- és falhatáron a polcot és a falat, a könyvtár végén a periodikus visszatérést.
 */
export function turnLabel(addr, dir, twoPage, lang = 'en') {
  const target = turnTarget(addr, dir, twoPage);
  const pages = shownPages(addr, twoPage);
  const e = edge(lang);
  const u = unit(lang);
  if (dir > 0 && target === 0n && pages[pages.length - 1] === N - 1n) return e.toZero;
  if (dir < 0 && target === N - 1n && pages[0] === 0n) return e.toLast;
  const a = calculateHierarchy(addr);
  const b = calculateHierarchy(target);
  const phrase = pagesPhrase(target, twoPage, lang);
  if (a.hex !== b.hex) return e.hex(dir, phrase);
  if (a.wall !== b.wall) return `${u.wall(b.wall)}, ${u.shelf(b.shelf)}, ${u.book(b.vol)}, ${phrase}`;
  if (a.shelf !== b.shelf) return `${u.shelf(b.shelf)}, ${u.book(b.vol)}, ${phrase}`;
  if (a.vol !== b.vol) return `${u.book(b.vol)}, ${phrase}`;
  return phrase;
}

/** Megjegyzés a nézet széléről: kötet vége, a könyvtár vége. Üres, ha nincs mit mondani. */
export function edgeNote(addr, twoPage, lang = 'en') {
  const pages = shownPages(addr, twoPage);
  const last = pages[pages.length - 1];
  if (last === N - 1n) return edge(lang).end;
  if (pageOf(last) === PAGES) return edge(lang).lastOfBook(calculateHierarchy(last).vol);
  return '';
}

/** Egy találat helye a 40 × 80-as lapon (1-től számozva). */
export function matchLocation(start, length) {
  const end = start + Math.max(length, 1) - 1;
  return {
    line: Math.floor(start / LINE_LENGTH) + 1,
    col: (start % LINE_LENGTH) + 1,
    endLine: Math.floor(end / LINE_LENGTH) + 1,
    endCol: (end % LINE_LENGTH) + 1,
  };
}

/** „line 3, from character 41” — vagy, ha a találat sort tör, a két végpontja. */
export function matchPhrase(start, length, lang = 'en') {
  const m = matchLocation(start, length);
  if (lang === 'hu') {
    if (m.line === m.endLine) return `${m.line}. sor, ${m.col}. karaktertől`;
    return `${m.line}. sor, ${m.col}. karaktertől – ${m.endLine}. sor, ${m.endCol}. karakterig`;
  }
  if (m.line === m.endLine) return `line ${m.line}, from character ${m.col}`;
  return `from line ${m.line}, character ${m.col}, to line ${m.endLine}, character ${m.endCol}`;
}

/** A lap egy sorának darabjai a kiemeléssel: [{ text, mark }]. */
export function lineSegments(text, lineIndex, hitStart = -1, hitLength = 0) {
  const from = lineIndex * LINE_LENGTH;
  const line = text.slice(from, from + LINE_LENGTH);
  if (hitStart < 0 || hitLength <= 0) return [{ text: line, mark: false }];
  const a = Math.max(hitStart - from, 0);
  const b = Math.min(hitStart + hitLength - from, LINE_LENGTH);
  if (b <= 0 || a >= LINE_LENGTH || a >= b) return [{ text: line, mark: false }];
  return [
    { text: line.slice(0, a), mark: false },
    { text: line.slice(a, b), mark: true },
    { text: line.slice(b), mark: false },
  ].filter((s) => s.text.length > 0);
}
