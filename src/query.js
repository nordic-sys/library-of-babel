// query.js
// A beírt sor átvezetése a könyvtár 32 jelére, annak elmondása, mi változott rajta, és a
// sor elhelyezése egy lapon. Determinisztikus: ugyanaz a sor ugyanabban a módban mindig
// ugyanarra a lapra, ugyanarra a helyre kerül.
import { ALPHABET, getPageAddress } from './core.js';

export const PAGE_LENGTH = 3200;
/** Az ábécén kívüli karakterek szűréséhez. */
const ALLOWED_RE = /[^abcdefghijklmnopqrstuvwxyz ,.?!-]/g;

/**
 * Kisbetűsít, az ékezeteket alapbetűre bontja (a „várlak”-ból „varlak” lesz, nem „vrlak”),
 * és kidobja, ami utána sincs az ábécében.
 */
export function normalizeQuery(raw) {
  const folded = raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const dropped = Array.from(new Set(folded.match(ALLOWED_RE) ?? []));
  return { text: folded.replace(ALLOWED_RE, ''), dropped };
}

const NOTES = {
  en: {
    capitals: 'capitals lowered',
    fold: (c, b) => `${c} read as ${b}`,
    otherAccents: 'other accents dropped',
    numerals: (d) => `${d} left out: there are no numerals here`,
    dropped: (shown, more) => `${shown}${more ? ' and more' : ''} left out`,
    lineBreak: 'the line break',
    tab: 'the tab',
    and: 'and',
  },
  hu: {
    capitals: 'nagybetű helyett kisbetű',
    fold: (c, b) => `„${c}” helyett „${b}”`,
    otherAccents: 'a többi ékezet is lemarad',
    numerals: (d) => `${d} kimarad, mert itt nincsenek számjegyek`,
    dropped: (shown, more) => `${shown}${more ? ' és még néhány jel' : ''} kimarad`,
    lineBreak: 'a sortörés',
    tab: 'a tabulátor',
    and: 'és',
    // A kimaradt jelek idézőjelben, vesszővel elválasztva — csupaszon egymás mellett olvashatatlanok.
    char: (c) => `„${c}”`,
    sep: ', ',
  },
};
const notesFor = (lang) => NOTES[lang] ?? NOTES.en;

function describeDropped(dropped, raw, n) {
  const digits = raw.match(/\d+/g);
  const onlyDigits = dropped.every((c) => /\d/.test(c));
  if (onlyDigits && digits) return n.numerals(digits.slice(0, 2).join(', '));
  const shown = dropped
    .slice(0, 4)
    .map((c) => (c === '\n' ? n.lineBreak : c === '\t' ? n.tab : n.char ? n.char(c) : c))
    .join(n.sep ?? ' ');
  return n.dropped(shown, dropped.length > 4);
}

/**
 * Mi történt a beírt sorral, emberi nyelven — üres lista, ha semmi.
 * Pl. „Tlön, 1940” → ['capitals lowered', 'ö read as o', '1940 left out: there are no numerals here'].
 */
export function describeChanges(raw, lang = 'en') {
  const n = notesFor(lang);
  const notes = [];
  if (raw !== raw.toLowerCase()) notes.push(n.capitals);
  const folds = new Map();
  for (const ch of raw.toLowerCase()) {
    const base = ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (base !== ch && base.length > 0 && !folds.has(ch)) folds.set(ch, base);
  }
  const foldList = [...folds].slice(0, 3).map(([c, b]) => n.fold(c, b));
  if (folds.size > 3) foldList.push(n.otherAccents);
  notes.push(...foldList);
  const { dropped } = normalizeQuery(raw);
  if (dropped.length > 0) notes.push(describeDropped(dropped, raw, n));
  return notes;
}

/** „a, b and c” / „a, b és c” */
export function joinAnd(items, lang = 'en') {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} ${notesFor(lang).and} ${items[items.length - 1]}`;
}

/** Determinisztikus PRNG, hogy ugyanaz a keresés mindig ugyanazt a címet adja. */
export function makeRandom(seedText) {
  let h = 0x811c9dc5;
  for (let i = 0; i < seedText.length; i++) {
    h ^= seedText.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  let state = h || 1;
  return () => {
    state ^= state << 13; state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5; state >>>= 0;
    return state / 4294967296;
  };
}

/**
 * A sor elhelyezése: véletlen lap, véletlen hely. „Whole words” módban a sor elé és mögé
 * szóköz vagy írásjel kerül, így nem egy hosszabb szó belsejében áll.
 * `nth`: a sor csillagászati számú lapon áll; az n. találat egy másik, ugyanígy kiszámolt lap.
 * A 0. a régi elhelyezés (ugyanaz a mag), így a régi linkek és mentések nem változnak.
 * Vissza: { address, start, length } — a kiemelés pontosan ezt a tartományt fedi.
 */
export function placeQuery(query, mode, nth = 0) {
  const clipped = query.slice(0, PAGE_LENGTH);
  const random = makeRandom(nth > 0 ? `${clipped}|${mode}|${nth}` : `${clipped}|${mode}`);

  const pageChars = [];
  for (let i = 0; i < PAGE_LENGTH; i++) {
    pageChars.push(ALPHABET[Math.floor(random() * ALPHABET.length)]);
  }

  const start = Math.floor(random() * (PAGE_LENGTH - clipped.length + 1));

  if (mode === 'exact') {
    const punctuations = [' ', ',', '.', '?', '!', '-'];
    const pick = () => punctuations[Math.floor(random() * punctuations.length)];
    if (start > 0) pageChars[start - 1] = pick();
    if (start + clipped.length < PAGE_LENGTH) pageChars[start + clipped.length] = pick();
  }

  for (let i = 0; i < clipped.length; i++) pageChars[start + i] = clipped[i];

  return { address: getPageAddress(pageChars.join('')), start, length: clipped.length, text: clipped };
}
