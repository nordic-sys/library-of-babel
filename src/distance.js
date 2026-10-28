// distance.js
// „Milyen messze van?” — egy cím mérete emberi léptékben, a séta világában.
//
// Két bejárás (`layout.js` `topology`):
// - **gallery** (Borges szerint): a polcfalakon nincs ajtó; a hatszögek egy galériában, láncban
//   állnak, folyosóról folyosóra, és a folyosók csigalépcsőjén fel-le. A bejárható tér egy
//   függőleges sík (galéria × emeletek); a számozás a 0. hatszögtől négyzetes spirálban halad
//   kifelé (`spiralAt`), így n hatszög √n élű négyzetben áll.
// - **lattice** (telt falak): minden polcfal közepén könyvekkel keretezett ajtó, két folyosó a
//   galéria mentén; egy szinten hat szomszéd, emeletet csak folyosóban lehet váltani. A számozás
//   héjanként halad kifelé (`shellAt`), így n hatszög ∛n élű tömbben áll.
//
// Helyek: axiális (q, r) a szinten — q a galéria mentén (előre +), r az egyik ajtótengely
// mentén; a két tengely 120°-ot zár be (az árnyaló `setLattice`-e 60°-os bázist használ, az ottani
// koordináták nem ezek), a harmadik ajtótengely a q + r irány —, z az emelet
// (fel +). A számozás a 0. hatszögtől héjanként halad kifelé (a k. héj a max(|q|, |r|, |z|) = k
// helyek köre), így az első n hatszög ∛n élű tömbben áll. A legrövidebb út zárt alakú
// (`shortestRoute`); a teszt (`location.test.mjs`) a valódi gráfon — folyosó-csomópontokkal,
// lépcsővel csak ott — Dijkstra-útkereséssel ellenőrzi.
import { N } from './core.js';
import { FLOOR_H, HEX_STEP } from './geometry.js';
import { getLayout, pagesPerHex, topology } from './layout.js';


/* A könyvtár hatszögei. N nem osztható a hatszög lapszámával: az utolsó hatszög nem teljes, de
 * helynek az is hely, ezért felfelé kerekítünk. */
/** A hatszögek száma az elrendezésben (`layout.js`): a hatszögenkénti lapszám ettől függ. */
const hexCount = (layout) => (N + pagesPerHex(layout) - 1n) / pagesPerHex(layout);
const WALK_M_PER_S = 5000 / 3600;
/** Egy lépés hatszögről hatszögre (s) és egy emelet a csigalépcsőn (18 fok, kb. 15 s). */
export const STEP_S = HEX_STEP / WALK_M_PER_S;
export const FLOOR_S = 15;
const YEAR_S = 365.25 * 24 * 3600;
const LIGHT_YEAR_M = 299792458 * YEAR_S; // Julián fényév

const abs = (v) => (v < 0n ? -v : v);
const sign = (v) => (v < 0n ? -1n : 1n);
const min = (a, b) => (a < b ? a : b);

/** log10 egy tízes számrendszerbeli számjegysorból (akár több ezer jegy). */
function log10Digits(s) {
  if (s.length <= 15) return Math.log10(Number(s));
  return Math.log10(Number(s.slice(0, 15))) + (s.length - 15);
}

/** log10 egy (akár több ezer jegyű) nemnegatív BigInt-ből; 0-ra -Infinity. */
export function log10Big(x) {
  return x <= 0n ? -Infinity : log10Digits(x.toString());
}

/* log10(10^a + 10^b + …), a nagy kitevők túlcsordulása nélkül. */
function logSum(...logs) {
  const hi = Math.max(...logs);
  if (hi === -Infinity) return -Infinity;
  return hi + Math.log10(logs.reduce((sum, l) => sum + 10 ** (l - hi), 0));
}

/** Egész k-adik gyök (lefelé kerekítve), Newton-iterációval. */
export function iroot(n, k = 2n) {
  if (n < 2n) return n;
  let x = 1n << (BigInt(n.toString(2).length) / k + 1n);
  for (;;) {
    const y = ((k - 1n) * x + n / x ** (k - 1n)) / k;
    if (y >= x) return x;
    x = y;
  }
}

/* A k. négyzetgyűrű i. helye (0 ≤ i < 8k), a (k, -k+1) sarokból körbe — csak a számozáshoz. */
function ringAt(k, i) {
  const side = 2n * k;
  if (i < side) return [k, -k + 1n + i];
  if (i < 2n * side) return [k - 1n - (i - side), k];
  if (i < 3n * side) return [-k, k - 1n - (i - 2n * side)];
  return [-k + 1n + (i - 3n * side), -k];
}

/**
 * A héjas számozás n-edik helye ({ q, r, z, shell }). A k. héjban előbb az alsó lap (z = -k)
 * sorfolytonosan, aztán a köztes szintek gyűrűi alulról felfelé, végül a felső lap. Az első
 * (2k+1)³ hatszög a 0..k héjakban áll.
 */
export function shellAt(n) {
  if (n === 0n) return { q: 0n, r: 0n, z: 0n, shell: 0n };
  const k = (iroot(n, 3n) + 1n) / 2n;
  const edge = 2n * k + 1n;
  let t = n - (2n * k - 1n) ** 3n;
  if (t < edge * edge) return { q: -k + (t % edge), r: -k + t / edge, z: -k, shell: k };
  t -= edge * edge;
  const ring = 8n * k;
  if (t < (2n * k - 1n) * ring) {
    const [q, r] = ringAt(k, t % ring);
    return { q, r, z: -k + 1n + t / ring, shell: k };
  }
  t -= (2n * k - 1n) * ring;
  return { q: -k + (t % edge), r: -k + t / edge, z: k, shell: k };
}

/**
 * A galériás (Borges szerinti) bejárás számozása: négyzetes spirál a galéria (q) és az emeletek (z)
 * síkjában. A k. gyűrű a max(|q|, |z|) = k helyek köre; az első (2k+1)² hatszög a 0..k gyűrűkben.
 */
export function spiralAt(n) {
  if (n === 0n) return { q: 0n, r: 0n, z: 0n, ring: 0n };
  const k = (iroot(n) + 1n) / 2n;
  const [q, z] = ringAt(k, n - (2n * k - 1n) ** 2n);
  return { q, r: 0n, z, ring: k };
}

/**
 * A legrövidebb út a galériás bejárásban: a galéria mentén |Δq| lépés, a lépcsőn |Δz| emelet.
 * Emeletet csak folyosóban lehet váltani; ha az út nem halad át folyosón (Δq = 0), egy lépés kitérő.
 */
export function galleryRoute(from, to) {
  const dq = to.q - from.q;
  const dz = to.z - from.z;
  const legs = [];
  if (dq !== 0n) legs.push([dq > 0n ? 'forward' : 'back', abs(dq)]);
  const hallDetour = dz !== 0n && dq === 0n;
  if (dz !== 0n) legs.push(['floors', dz]);
  const steps = abs(dq) + (hallDetour ? 1n : 0n);
  const secondsLog = logSum(log10Big(steps) + Math.log10(STEP_S), log10Big(abs(dz)) + Math.log10(FLOOR_S));
  return { legs, steps, floors: abs(dz), hallDetour, secondsLog, seconds: secondsLog < 300 ? 10 ** secondsLog : Infinity };
}

/**
 * A hat szomszéd iránya axiálisan. A folyosók a galéria mentén (előre, hátra), a négy ajtó a
 * polcfalakon: kettő előre ferdén, kettő hátra ferdén.
 */
export const DIRS = {
  forward: [1n, 0n],
  back: [-1n, 0n],
  aheadRight: [1n, 1n],
  backLeft: [-1n, -1n],
  backRight: [0n, 1n],
  aheadLeft: [0n, -1n],
};

/** A legkevesebb lépés a szinten (dq, dr)-ig. */
export function hexDistance(dq, dr) {
  return (dq >= 0n) === (dr >= 0n) ? (abs(dq) > abs(dr) ? abs(dq) : abs(dr)) : abs(dq) + abs(dr);
}

/**
 * A legrövidebb út két hely között ({ q, r, z }). Vissza: a szakaszok ([irány, lépésszám] és
 * ['floors', ±emelet]), a lépések száma hatszögről hatszögre (`steps`), az emeletek, az idő
 * log10-e másodpercben (`secondsLog`) és — ha kicsi — maga az idő (`seconds`).
 *
 * A szinten legfeljebb két irány kell. Emeletet csak folyosóban lehet váltani: ha egyetlen
 * legrövidebb út sem halad át folyosón (nincs benne előre/hátra lépés), egy lépés kitérő kell —
 * be a legközelebbi folyosóba és vissza, vagy egy folyosós lépés egy ajtós helyett.
 */
export function shortestRoute(from, to) {
  const dq = to.q - from.q;
  const dr = to.r - from.r;
  const dz = to.z - from.z;
  const legs = [];
  const add = (dir, n) => { if (n > 0n) legs.push([dir, n]); };
  if ((dq >= 0n) === (dr >= 0n)) {
    // Azonos előjel: átlósan (q + r irány) a kisebbik erejéig, a maradék egyenesen.
    const diag = min(abs(dq), abs(dr));
    add(sign(dq) > 0n ? 'forward' : 'back', abs(dq) - diag);
    add((dq >= 0n && dr >= 0n) ? 'aheadRight' : 'backLeft', diag);
    add(dr > 0n ? 'backRight' : 'aheadLeft', abs(dr) - diag);
  } else {
    add(dq > 0n ? 'forward' : 'back', abs(dq));
    add(dr > 0n ? 'backRight' : 'aheadLeft', abs(dr));
  }
  // A lépcső a folyosóban van: az emeletváltás a galéria menti szakasz végére kerül (annak utolsó
  // folyosójában lehet lépcsőzni), így a szakaszok sorban bejárhatók. Ha nincs ilyen szakasz, elöl
  // áll, a folyosóra kitérővel.
  const along = legs.findIndex(([dir]) => dir === 'forward' || dir === 'back');
  const hallDetour = dz !== 0n && along < 0;
  if (dz !== 0n) legs.splice(along < 0 ? 0 : along + 1, 0, ['floors', dz]);
  const steps = hexDistance(dq, dr) + (hallDetour ? 1n : 0n);
  const secondsLog = logSum(log10Big(steps) + Math.log10(STEP_S), log10Big(abs(dz)) + Math.log10(FLOOR_S));
  return { legs, steps, floors: abs(dz), hallDetour, secondsLog, seconds: secondsLog < 300 ? 10 ** secondsLog : Infinity };
}

/**
 * Egy szám a kitevőjével: 10^6 alatt kiírva ({ plain, value }), fölötte { m: '3.2', e: 4812 }.
 * A határt a kerekített érték dönti el, így „1,000,000” sosem jelenik meg kiírva.
 */
export function bigNumber(log, lang = 'en') {
  if (log < 6) {
    const value = Math.round(10 ** log);
    if (value < 1e6) return { plain: new Intl.NumberFormat(lang).format(value), value };
  }
  let e = Math.floor(log);
  let m = 10 ** (log - e);
  if (m >= 9.95) {
    m = 1;
    e += 1;
  }
  return { m: new Intl.NumberFormat(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(m), e };
}

const ORIGIN = { q: 0n, r: 0n, z: 0n };

/**
 * A cím távolsága a 0. hatszögtől, a legrövidebb úton. Vissza: a hatszög sorszáma (és a jegyei
 * száma), a helye, az út, az idő években, a fény ideje egyenes vonalban, és az
 * egyetlen-galéria táv összevetésnek.
 */
export function howFar(addr, layout = getLayout()) {
  const hex = addr / pagesPerHex(layout);
  const digits = hex.toString();
  const gallery = topology(layout) === 'gallery';
  const place = gallery ? spiralAt(hex) : shellAt(hex);
  const route = gallery ? galleryRoute(ORIGIN, place) : shortestRoute(ORIGIN, place);
  const step = Math.log10(HEX_STEP);
  const walkYearsLog = route.secondsLog - Math.log10(YEAR_S);
  // Egyenes vonal. A galériában a hatszögek egy egyenesen állnak; a rácson a q és az r tengely
  // 120°-ot zár be, így |q·a + r·b|² = lépés² · (q² − qr + r²).
  const { q, r, z } = place;
  const planeLog = log10Big(q * q - q * r + r * r) / 2 + step;
  const straightLog = logSum(2 * planeLog, 2 * (log10Big(abs(z)) + Math.log10(FLOOR_H))) / 2;
  return {
    hex,
    hexDigits: digits.length,
    ...place,
    route,
    walkSeconds: hex === 0n ? 0 : route.seconds,
    walkYearsLog,
    lightYearsLog: straightLog - Math.log10(LIGHT_YEAR_M),
    lineMetresLog: hex === 0n ? -Infinity : log10Digits(digits) + step,
    // A világegyetem korát akkor említjük, ha a kiírt gyalogidő már legalább 1,0 × 10^10 év
    // (a `bigNumber` 9,95-től felfelé kerekít).
    universeScale: walkYearsLog >= 9 + Math.log10(9.95),
  };
}

/**
 * A könyvtár kiterjedése: a legkülső héj (gyűrű) éle hatszögben (= emeletben). Állandó,
 * elrendezésenként egyszer számoljuk.
 */
const edgeLogs = {};
export function libraryEdgeLog(layout = getLayout()) {
  const last = hexCount(layout) - 1n;
  edgeLogs[layout] ??= log10Big(2n * (topology(layout) === 'gallery' ? spiralAt(last).ring : shellAt(last).shell) + 1n);
  return edgeLogs[layout];
}

/** A hatszögek száma (log10) és az utolsó hatszög lapjai az elrendezésben. */
export const hexCountLog = (layout = getLayout()) => log10Big(hexCount(layout));
export const lastHexPages = (layout = getLayout()) => Number(N % pagesPerHex(layout));

/* Az idő gyalog: perc, óra, nap — vagy év. A mértékegységet a kerekített érték választja,
 * így nincs „60 perc” és „48 óra”; egy percnél rövidebb útra nem mondunk „1 percet”. */
function duration(seconds, log, words, lang) {
  const fmt = new Intl.NumberFormat(lang);
  if (seconds < 30) return words.underMinute;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return words.minutes(fmt.format(minutes), minutes);
  const hours = Math.round(seconds / 3600);
  if (hours < 48) return words.hours(fmt.format(hours), hours);
  const days = Math.round(seconds / 86400);
  if (days < 730) return words.days(fmt.format(days), days);
  return words.years(bigNumber(log, lang));
}

/* Angol többes szám a számértékből (nem a formázott szövegből); a nagy számok mindig többes. */
const s = (value) => (value === 1 ? '' : 's');

/*
 * A mondatok nyelvenként. A szám helyén objektum áll ({ plain } vagy { m, e }), a felület
 * rajzolja ki felső indexszel. Magyarul a szám után soha nincs rag: „… méter”, „… emelet”.
 */
const TEXT = {
  en: {
    first: 'This is hexagon 0, where the numbering begins.',
    number: (n) => [`The number of this hexagon, counting from 0: ${n}. The label above gives the same number in base 36.`],
    digits: (d, cut) => [`Counting from 0, the number of this hexagon has ${d} decimal digits. The label above gives ${cut ? 'the start of it' : 'the same number'} in base 36.`],
    model: {
      gallery: 'As in the story, there are no doors in the shelf walls: the hexagons stand in a row along one gallery, hallway after hallway, and in each hallway a spiral stair goes up and down. Number the hexagons outward from hexagon 0, in a square spiral along the gallery and the floors.',
      lattice: 'Each of the four shelf walls has a door in the middle, framed by books; the two free sides open onto hallways, and only in the hallways do the spiral stairs go up and down. Number the hexagons outward from hexagon 0, shell by shell.',
    },
    route: (legs) => ['The shortest way here from hexagon 0: ', ...joinLegs(legs, ' and '), '.'],
    dir: {
      forward: 'forward along the gallery',
      back: 'back along the gallery',
      aheadRight: 'ahead to the right',
      backLeft: 'back to the left',
      backRight: 'back to the right',
      aheadLeft: 'ahead to the left',
    },
    hexLeg: (n, dir) => [n, ` hexagon${s(n.value)} ${dir}`],
    floorLeg: (n, d) => [n, ` floor${s(n.value)} ${d > 0 ? 'up' : 'down'}`],
    hall: 'There are no stairs in a hexagon: for those, out into a hallway and back.',
    walk: (x) => ['On foot — five kilometres an hour, eighteen stairs to each floor, never resting: ', x, '.'],
    universe: (x) => ['The universe is 13.8 billion years old (', x, ' years).'],
    light: (x) => ['Light, in a straight line, would need ', x, ` year${s(x.value)}.`],
    line: {
      gallery: (x) => ['Were every hexagon in one gallery on a single floor, this one would be ', x, ' metres away. The stairs make the way immeasurably shorter.'],
      lattice: (x) => ['Were every hexagon in one gallery on a single floor, this one would be ', x, ' metres away. The doors and the stairs make the way immeasurably shorter.'],
    },
    width: {
      gallery: (x) => ['The whole library: one gallery ', x, ' hexagons long, and as many floors high.'],
      lattice: (x) => ['The whole library: ', x, ' hexagons long, as many wide, and as many floors high.'],
    },
    other: { borges: 'As Borges wrote (32 books to a shelf)', dense: 'With full walls of shelves' },
    against: { borges: 'That library is larger, but its numbering puts this page nearer.', dense: 'That library is smaller, but its numbering puts this page farther out.' },
    orders: (k, longer) => `${longer ? 'longer' : 'shorter'} than the way as it is now by ${k} order${k === 1 ? '' : 's'} of magnitude`,
    compare: (who, x, pct) => [`${who}, this page would stand elsewhere: the way there on foot would be `, x, ` — ${pct} of the way as it is now.`],
    compareFar: (who, x, orders) => [`${who}, this page would stand elsewhere: the way there on foot would be `, x, ` — ${orders}.`],
    compareZero: (who) => [`${who}, this page would stand in hexagon 0, where the numbering begins.`],
    compareFromZero: (who, x) => [`${who}, this page would stand elsewhere: `, x, ' away on foot.'],
    underMinute: ['less than a minute'],
    minutes: (n, v) => [`${n} minute${s(v)}`],
    hours: (n, v) => [`${n} hour${s(v)}`],
    days: (n, v) => [`${n} day${s(v)}`],
    years: (x) => [x, ` year${s(x.value)}`],
  },
  hu: {
    first: 'Ez a 0. hatszög: itt kezdődik a számozás.',
    number: (n) => [`A hatszög sorszáma nullától számolva ${n}; a fenti felirat ugyanezt a számot harminchatos számrendszerben mutatja.`],
    digits: (d, cut) => [`A hatszög sorszáma nullától számolva, tízes számrendszerben ${d} számjegyből áll. A fenti felirat ${cut ? 'ennek csak az elejét mutatja, harminchatos számrendszerben' : 'ugyanezt a számot harminchatos számrendszerben mutatja'}.`],
    model: {
      gallery: 'Ahogy a novellában: a polcfalakon nincs ajtó; a hatszögek egyetlen galériában sorakoznak, folyosó köti össze őket, és minden folyosóban csigalépcső visz fel és le. A hatszögeket a 0. hatszögtől kifelé számozzuk, négyzetes spirálban, a galéria és az emeletek síkjában.',
      lattice: 'A négy polcfal mindegyikének közepén könyvekkel keretezett ajtó nyílik; a két szabad oldal folyosóra vezet, és csigalépcső csak a folyosókban van. A hatszögeket a 0. hatszögtől kifelé számozzuk, héjról héjra.',
    },
    route: (legs) => ['A legrövidebb út ide a 0. hatszögtől: ', ...joinLegs(legs, ' és '), '.'],
    dir: {
      forward: 'előre a galéria mentén',
      back: 'hátra a galéria mentén',
      aheadRight: 'jobbra előre',
      backLeft: 'balra hátra',
      backRight: 'jobbra hátra',
      aheadLeft: 'balra előre',
    },
    hexLeg: (n, dir) => [n, ` hatszögnyit ${dir}`],
    floorLeg: (n, d) => [n, ` emeletet ${d > 0 ? 'felfelé' : 'lefelé'}`],
    hall: 'A hatszögekben nincs lépcső: ezért ki kell menni egy folyosóra, majd vissza.',
    walk: (x) => ['Gyalog — óránként öt kilométer, emeletenként tizennyolc lépcsőfok, pihenő nélkül: ', x, '.'],
    universe: (x) => ['A világegyetem 13,8 milliárd éves (', x, ' év).'],
    light: (x) => ['A fény egyenes vonalban ', x, ' év alatt érne ide.'],
    line: {
      gallery: (x) => ['Ha minden hatszög egyetlen galériában, egyetlen szinten állna, ez a hatszög ', x, ' méterre volna. A lépcsők mérhetetlenül lerövidítik az utat.'],
      lattice: (x) => ['Ha minden hatszög egyetlen galériában, egyetlen szinten állna, ez a hatszög ', x, ' méterre volna. Az ajtók és a lépcsők mérhetetlenül lerövidítik az utat.'],
    },
    width: {
      gallery: (x) => ['Az egész könyvtár egyetlen galéria: ', x, ' hatszög hosszú és ugyanannyi emelet magas.'],
      lattice: (x) => ['Az egész könyvtár ', x, ' hatszög hosszú, ugyanannyi széles és ugyanannyi emelet magas.'],
    },
    other: { borges: 'Borges elrendezésében (polconként 32 könyvvel)', dense: 'Telt falakkal' },
    against: { borges: 'Az a könyvtár nagyobb, de a számozása miatt ez a lap közelebb kerül.', dense: 'Az a könyvtár kisebb, de a számozása miatt ez a lap messzebbre kerül.' },
    orders: (k, longer) => `a mostaninál ${longer ? 'hosszabb' : 'rövidebb'}, a különbség ${k} nagyságrend`,
    compare: (who, x, pct) => [`${who} ez a lap máshol állna: oda gyalog `, x, ` volna az út — a mostaninak ${pct}.`],
    compareFar: (who, x, orders) => [`${who} ez a lap máshol állna: oda gyalog `, x, ` volna az út — ${orders}.`],
    compareZero: (who) => [`${who} ez a lap a 0. hatszögben állna, ahol a számozás kezdődik.`],
    compareFromZero: (who, x) => [`${who} ez a lap máshol állna: gyalog `, x, ' volna az út.'],
    underMinute: ['egy percnél kevesebb'],
    minutes: (n) => [`${n} perc`],
    hours: (n) => [`${n} óra`],
    days: (n) => [`${n} nap`],
    years: (x) => [x, ' év'],
  },
};
const text = (lang) => TEXT[lang] ?? TEXT.en;

/* „a, b and c”: a szakaszok listája, vesszővel, az utolsó előtt kötőszóval. */
function joinLegs(legs, and) {
  return legs.flatMap((leg, i) => [i === 0 ? '' : i === legs.length - 1 ? and : ', ', ...leg]).filter((p) => p !== '');
}

/** A „Milyen messze van?” bekezdései: darabok listái (szöveg vagy szám-objektum). */
export function distanceParagraphs(addr, lang = 'en') {
  const w = text(lang);
  const f = howFar(addr);
  const fmt = new Intl.NumberFormat(lang);
  const out = [];
  if (f.hex === 0n) {
    out.push([w.first]);
    out.push([w.model[topology()]]);
  } else {
    // A fejléc (`hexLabel`) a 36-os alakot 8 jegy fölött vágja le.
    out.push(f.hexDigits <= 6 ? w.number(fmt.format(f.hex)) : w.digits(fmt.format(f.hexDigits), f.hex >= 36n ** 8n));
    out.push([w.model[topology()]]);
    const legs = f.route.legs.map(([kind, n]) => (kind === 'floors'
      ? w.floorLeg(bigNumber(log10Big(abs(n)), lang), n > 0n ? 1 : -1)
      : w.hexLeg(bigNumber(log10Big(n), lang), w.dir[kind])));
    out.push(f.route.hallDetour ? [...w.route(legs), ' ', w.hall] : w.route(legs));
    const walk = w.walk(duration(f.walkSeconds, f.walkYearsLog, w, lang));
    // A világegyetem korát tízes hatványként is kiírjuk, hogy legyen mihez mérni a gyalogidőt.
    out.push(f.universeScale ? [...walk, ' ', ...w.universe(bigNumber(Math.log10(1.38e10), lang))] : walk);
    if (f.lightYearsLog >= 0) out.push(w.light(bigNumber(f.lightYearsLog, lang)));
    if (f.hexDigits > 6) out.push(w.line[topology()](bigNumber(f.lineMetresLog, lang)));
  }
  // Összevetés a másik elrendezéssel (`layout.js`): ugyanaz a lap ott másik hatszögben áll.
  const otherId = getLayout() === 'dense' ? 'borges' : 'dense';
  const o = howFar(addr, otherId);
  if (o.hex === 0n) out.push(w.compareZero(w.other[otherId]));
  else {
    const way = duration(o.walkSeconds, o.walkYearsLog, w, lang);
    if (f.hex === 0n) out.push(w.compareFromZero(w.other[otherId], way));
    else if (f.walkSeconds < 30 && o.walkSeconds < 30) {
      // Mindkét út egy percnél rövidebb: a százalék itt semmit sem mondana.
      out.push(w.compareFromZero(w.other[otherId], way));
    } else {
      const diffLog = o.route.secondsLog - f.route.secondsLog;
      const ratio = 10 ** diffLog;
      const shown = Math.round(ratio * 100);
      // Ha a két út több mint tízszeresen eltér (a két elrendezés tere más: sík és tömb), százalék
      // helyett a nagyságrendek számát mondjuk.
      if (Math.abs(diffLog) >= 1) {
        out.push(w.compareFar(w.other[otherId], way, w.orders(Math.round(Math.abs(diffLog)), diffLog > 0)));
        out.push(w.width[topology()](bigNumber(libraryEdgeLog(), lang)));
        return out.map((parts) => parts.flat());
      }
      const pct = lang === 'hu'
        ? `${new Intl.NumberFormat('hu').format(shown)} százaléka`
        : `${new Intl.NumberFormat('en').format(shown)}%`;
      // A telt falas könyvtár kisebb, átlagosan ~60%-ra rövidülnek az utak — de egy adott lap a héjas
      // számozásban kerülhet messzebb is. Ha a kiírt (kerekített) arány ezzel szembemegy, kimondjuk.
      const surprising = (otherId === 'dense' && shown > 100) || (otherId === 'borges' && shown < 100);
      const line = w.compare(w.other[otherId], way, pct);
      out.push(surprising ? [...line, ' ', w.against[otherId]] : line);
    }
  }
  out.push(w.width[topology()](bigNumber(libraryEdgeLog(), lang)));
  return out.map((parts) => parts.flat());
}

export const DISTANCE_LANGS = TEXT;
