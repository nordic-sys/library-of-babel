// storage.js
// Minden, ami a böngészőben marad: a megtartott lapok, az utoljára olvasott lap és a séta
// kihagyása. Sérült vagy régi formátumú tároló nem akadályozhatja meg az indulást, és ha az
// írás nem sikerül, azt a hívó megtudja — nem mondhatjuk, hogy „Kept”, ha nem az.
import { LIBRARY_VERSION, N } from './core.js';

const BOOKMARKS_KEY = 'babel_bookmarks';
const LAST_READ_KEY = 'babel_last_read';
const SKIP_WALK_KEY = 'babel_skip_journey';

function read(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** Érvényes cím: csak számjegy, és a könyvtáron belül (0 ≤ cím < 32^3200). */
function validAddress(a) {
  return typeof a === 'string' && /^\d+$/.test(a) && a.length <= 4817 && BigInt(a) < N;
}

function validDate(d) {
  return typeof d === 'string' && !Number.isNaN(Date.parse(d)) ? new Date(d).toISOString() : null;
}

const str = (v) => (typeof v === 'string' ? v : '');
const start = (v) => (Number.isInteger(v) && v >= 0 && v < 3200 ? v : null);

/** Az új séma kanonikus alakja: ismeretlen vagy sérült mezőből biztonságos alapérték lesz. */
function canonical(item) {
  return {
    address: item.address,
    name: typeof item.name === 'string' && item.name ? item.name : null,
    highlight: str(item.highlight),
    start: start(item.start),
    matchMode: item.matchMode === 'exact' || item.matchMode === 'substring' ? item.matchMode : null,
    origin: ['search', 'random', 'address', 'link', 'unknown'].includes(item.origin) ? item.origin : 'unknown',
    savedAt: validDate(item.savedAt),
    version: Number.isInteger(item.version) ? item.version : 1,
    nth: Number.isInteger(item.nth) && item.nth >= 0 ? item.nth : null,
  };
}

/**
 * Régi (2026-08) bejegyzés: { address, title, isSearchHit, highlight, coordinates, version, date }.
 * Új: { address, name, highlight, matchMode, origin, savedAt, version }.
 * A régi cím-szerű „title” (HEX … · W4 S4 …) nem név, azt eldobjuk; a többi átnevezés volt.
 */
function migrate(item) {
  if (!item || typeof item !== 'object' || !validAddress(item.address)) return null;
  if ('origin' in item) return canonical(item);
  const highlight = typeof item.highlight === 'string' ? item.highlight : '';
  const title = typeof item.title === 'string' ? item.title : '';
  const generated = title === highlight || title.startsWith('HEX ') || title === item.coordinates;
  return canonical({
    address: item.address,
    name: generated ? null : title,
    highlight,
    origin: item.isSearchHit ? 'search' : 'unknown',
    savedAt: item.date,
    version: item.version ?? 1,
  });
}

export function readBookmarks() {
  const list = read(BOOKMARKS_KEY);
  if (!Array.isArray(list)) return [];
  return list.map(migrate).filter(Boolean);
}

export function writeBookmarks(list) {
  return write(BOOKMARKS_KEY, list);
}

export function makeBookmark({ address, highlight = '', start: at = null, matchMode = null, origin = 'unknown', nth = null }) {
  return {
    address,
    name: null,
    highlight,
    start: at,
    matchMode,
    origin,
    savedAt: new Date().toISOString(),
    version: LIBRARY_VERSION,
    nth,
  };
}

export function readLastRead() {
  const item = read(LAST_READ_KEY);
  if (!item || typeof item !== 'object' || !validAddress(item.address)) return null;
  if (item.version !== LIBRARY_VERSION) return null;
  return { ...canonical(item), version: LIBRARY_VERSION };
}

export function writeLastRead({ address, highlight = '', start: at = null, origin = 'unknown', matchMode = null, nth = null }) {
  return write(LAST_READ_KEY, { address, highlight, start: at, origin, matchMode, nth, version: LIBRARY_VERSION });
}

export function readSkipWalk() {
  try {
    return localStorage.getItem(SKIP_WALK_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeSkipWalk(value) {
  try {
    localStorage.setItem(SKIP_WALK_KEY, value ? '1' : '0');
  } catch {
    /* nem kritikus: a beállítás csak erre a munkamenetre él */
  }
}
