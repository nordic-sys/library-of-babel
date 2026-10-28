// core.js
// A Library of Babel mag-algoritmusa (Base-32, Oldal-szintű)

export const ALPHABET = "abcdefghijklmnopqrstuvwxyz ,.?!-";
export const LENGTH = 3200n;
export const BITS = 16000n; // 3200 * 5 = 16000
export const N = 1n << BITS; // 32^3200 == 2^16000

// Gyors 16000-bites maszk, ami egyenértékű a "mod N" művelettel
export const MASK = N - 1n;

/**
 * A címtér verziója.
 *
 * v1 hibás volt: a konstansgeneráló egy mod 2^32 LCG *alsó 4 bitjét* használta
 * (`state & 0xF`), aminek a periódusa 16 -> az M és OFFSET hexa számjegyei
 * 16 jegyenként (64 bitenként) ismétlődtek. Emiatt kis/strukturált címeknél
 * (pl. a 0-ás alapértelmezett cím) a generált oldal 64 karakteres periódussal
 * ismételte önmagát, ami láthatóan elrontotta a "kaotikus könyvtár" illúzióját.
 *
 * v2 SplitMix64-et használ, és minden lépésben a teljes 64 bites kimenetet
 * felhasználja. Ez megváltoztatja a cím <-> szöveg megfeleltetést, ezért a
 * verzió megjelenik a megosztott URL-ekben és a mentett könyvjelzőkben.
 */
export const LIBRARY_VERSION = 2;

const U64 = 0xFFFFFFFFFFFFFFFFn;

/** SplitMix64 — egy lépés, a teljes 64 bites kimenettel. */
function splitmix64(state) {
  let z = (state + 0x9e3779b97f4a7c15n) & U64;
  const nextState = z;
  z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & U64;
  z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & U64;
  z = (z ^ (z >> 31n)) & U64;
  return { state: nextState, value: z };
}

/**
 * Determinisztikus, nagy méretű konstans generálása.
 * Lépésenként 16 hexa számjegy (a teljes 64 bites SplitMix64 kimenet),
 * így nincs rövid periódusú bit-részhalmaz.
 */
function generateLargeBigInt(seed, hexLength) {
  let state = BigInt(seed) & U64;
  let hex = "";
  while (hex.length < hexLength) {
    const step = splitmix64(state);
    state = step.state;
    hex += step.value.toString(16).padStart(16, "0");
  }
  return BigInt("0x" + hex.slice(0, hexLength));
}

// Paraméterek
// M és OFFSET teljes 16000 bites (4000 hexa számjegy) számok, így egy kis cím
// (pl. 0 vagy 1) is a teljes 3200 karakteres oldalt érinti.
export const M = generateLargeBigInt(123456789n, 4000) | 1n; // Páratlan kell legyen
export const OFFSET = generateLargeBigInt(987654321n, 4000);
// Shift érték a Xorshift-hez (BITS / 2) -> így a művelet involúció
export const SHIFT = 8000n;

// Moduláris inverz mod 2^k Newton (Hensel) módszerrel
export function modInverse2(a, k) {
  let x = (3n * a) ^ 2n;
  let prevX = 0n;
  const mask = (1n << k) - 1n;
  while (x !== prevX) {
    prevX = x;
    x = (x * (2n - a * x)) & mask;
  }
  return x;
}

export const M_INV = modInverse2(M, BITS);

// Lookup táblák a gyors konverzióhoz
const CHAR_TO_VAL = new Map();
for (let i = 0; i < ALPHABET.length; i++) {
  CHAR_TO_VAL.set(ALPHABET[i], BigInt(i));
}

// A JS natív toString(32) által használt ábécé összekötése a miénkkel
const JS_BASE32_ALPHABET = "0123456789abcdefghijklmnopqrstuv";
const JS_TO_CUSTOM = {};
const CUSTOM_TO_JS = {};
for (let i = 0; i < 32; i++) {
  JS_TO_CUSTOM[JS_BASE32_ALPHABET[i]] = ALPHABET[i];
  CUSTOM_TO_JS[ALPHABET[i]] = JS_BASE32_ALPHABET[i];
}

/**
 * Szám konvertálása 3200 karakteres szöveggé natív toString segítségével.
 */
function numberToText(v) {
  const s = v.toString(32);
  let out = "";
  // Pad with zeroes (ami az 'a' karakterünk)
  const padLen = Number(LENGTH) - s.length;
  if (padLen > 0) {
    out += ALPHABET[0].repeat(padLen);
  }
  for (let i = 0; i < s.length; i++) {
    out += JS_TO_CUSTOM[s[i]];
  }
  return out;
}

/**
 * 3200 karakteres szöveg konvertálása számmá (Base-32 bit-eltolással).
 */
function textToNumber(text) {
  let v = 0n;
  // A Base-32 tökéletes a bit-eltolásra: minden karakter 5 bitet jelent
  for (let i = 0; i < text.length; i++) {
    v = (v << 5n) | CHAR_TO_VAL.get(text[i]);
  }
  return v;
}

/**
 * Forward: Cím (Address) -> Szöveg (Text)
 */
export function getPageText(address) {
  if (address < 0n || address >= N) {
    throw new Error("Address out of bounds");
  }
  // 1. Affin transzformáció: (address * M + OFFSET) mod N
  const v1 = (address * M + OFFSET) & MASK;
  // 2. Xorshift bitkeverés
  const v2 = v1 ^ (v1 >> SHIFT);
  // 3. Báziskonverzió
  return numberToText(v2);
}

/**
 * Reverse (Keresés): Szöveg (Text) -> Cím (Address)
 */
export function getPageAddress(text) {
  if (text.length !== Number(LENGTH)) {
    throw new Error(`Text must be exactly ${LENGTH} characters long.`);
  }
  // 1. Báziskonverzió
  const v2 = textToNumber(text);
  // 2. Reverse Xorshift (involúció, mivel shift = BITS / 2)
  const v1 = v2 ^ (v2 >> SHIFT);
  // 3. Reverse Affin transzformáció
  // address = ((v1 - OFFSET) * M_INV) mod N
  let v = (v1 - OFFSET) & MASK;
  if (v < 0n) v += N;
  const address = (v * M_INV) & MASK;
  return address;
}
