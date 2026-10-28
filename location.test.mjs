// location.test.mjs — a hely, az oldalpárok, a lapozó-feliratok és a keresés leírása.
import { N, getPageText } from './src/core.js';
import {
  calculateHierarchy, hexLabel, placeText, spreadOf, shownPages, turnTarget, turnLabel,
  edgeNote, matchLocation, matchPhrase, lineSegments, pageOf,
} from './src/location.js';
import { normalizeQuery, describeChanges, joinAnd, placeQuery } from './src/query.js';
import { missingKeys, huOrdinal, translate } from './src/i18n.js';
import {
  DIRS, DISTANCE_LANGS, FLOOR_S, STEP_S, bigNumber, distanceParagraphs, galleryRoute, hexDistance, howFar, iroot, log10Big, shellAt, shortestRoute, spiralAt,
} from './src/distance.js';
import { BOARD_END, BOOK, DOOR_GAP, DOOR_H, FLOOR_H } from './src/geometry.js';
import { booksPerHex, booksPerWall, pagesPerHex, setLayout, shelfRows, volumeX } from './src/layout.js';

let failed = 0;
function check(label, ok, detail = '') {
  console.log(`${ok ? '✅' : '❌'} ${label}${!ok && detail ? ` — got ${detail}` : ''}`);
  if (!ok) failed++;
}
const json = (v) => JSON.stringify(v, (_, x) => (typeof x === 'bigint' ? `${x}n` : x));
const eq = (label, got, want) => check(label, json(got) === json(want), json(got));

// Cím: ((((hex*4 + wall)*5 + shelf)*32 + vol)*410 + page)
const at = (hex, wall, shelf, vol, page) =>
  ((((BigInt(hex) * 4n + BigInt(wall - 1)) * 5n + BigInt(shelf - 1)) * 32n + BigInt(vol - 1)) * 410n + BigInt(page - 1));

eq('hierarchy of 0', calculateHierarchy(0n), { page: 1, vol: 1, shelf: 1, wall: 1, hex: '0' });
eq('hierarchy round-trips', calculateHierarchy(at(77, 4, 4, 24, 88)), { page: 88, vol: 24, shelf: 4, wall: 4, hex: (77).toString(36) });
eq('short hex has no ellipsis', hexLabel(calculateHierarchy(0n)), '0');
check('long hex is cut to 8 + …', hexLabel(calculateHierarchy(N - 1n)).length === 9);
eq('place text', placeText(calculateHierarchy(at(5, 4, 4, 24, 88))), 'wall 4 · shelf 4 · book 24 · page 88');

// Oldalpárok: bal = páros, jobb = páratlan.
const p88 = at(5, 4, 4, 24, 88);
eq('page 88 is the left of 88|89', spreadOf(p88), { left: p88, right: p88 + 1n });
eq('page 89 is the right of 88|89', spreadOf(p88 + 1n), { left: p88, right: p88 + 1n });
const p1 = at(5, 4, 4, 24, 1);
eq('page 1 stands alone on the right', spreadOf(p1), { left: null, right: p1 });
const p410 = at(5, 4, 4, 24, 410);
eq('page 410 stands alone on the left', spreadOf(p410), { left: p410, right: null });
eq('address 0 is page 1, alone', spreadOf(0n), { left: null, right: 0n });
check('the last book of the library has 206 pages', pageOf(N - 1n) === 206);
eq('N−1 stands alone on the left', spreadOf(N - 1n), { left: N - 1n, right: null });

// Lapozás ±2 és a feliratok.
check('next from 88|89 opens 90', turnTarget(p88, 1, true) === p88 + 2n);
check('prev from 88|89 opens 87', turnTarget(p88, -1, true) === p88 - 1n);
eq('turn label within a book', [turnLabel(p88, -1, true), turnLabel(p88, 1, true)], ['pages 86–87', 'pages 90–91']);
eq('turn label past page 410', turnLabel(p410, 1, true), 'book 25, page 1');
eq('turn label before page 1', turnLabel(p1, -1, true), 'book 23, page 410');
eq('turn label across a shelf', turnLabel(at(5, 4, 4, 32, 410), 1, true), 'shelf 5, book 1, page 1');
eq('turn label across a wall', turnLabel(at(5, 2, 5, 32, 410), 1, true), 'wall 3, shelf 1, book 1, page 1');
eq('turn label across a hexagon', turnLabel(at(5, 4, 5, 32, 410), 1, true), 'the next hexagon, page 1');
eq('the library is periodic: N−1 → 0', [turnTarget(N - 1n, 1, true), turnLabel(N - 1n, 1, true)], [0n, 'address 0, page 1']);
eq('…and 0 → N−1', turnLabel(0n, -1, true), 'the last page of the library');
eq('single-page turning is ±1', [turnTarget(p88, 1, false) === p88 + 1n, turnLabel(p88, 1, false)], [true, 'page 89']);
eq('shown pages, two-page', shownPages(p88 + 1n, true), [p88, p88 + 1n]);
check('edge note on page 410', edgeNote(p410, true).startsWith('Page 410 is the last page of book 24.'));
check('edge note at the end of the library', edgeNote(N - 1n, true).includes('periodic'));
check('no edge note mid-book', edgeNote(p88, true) === '');

// Találat helye és kiemelés.
eq('match at char 160 is line 3, col 1', matchLocation(160, 5), { line: 3, col: 1, endLine: 3, endCol: 5 });
eq('match phrase', matchPhrase(200, 23), 'line 3, from character 41');
eq('match across a line break', matchPhrase(75, 10), 'from line 1, character 76, to line 2, character 5');
const text = getPageText(p88);
eq('segments mark exactly the hit', lineSegments(text, 2, 200, 23).map((s) => [s.text.length, s.mark]), [[40, false], [23, true], [17, false]]);
eq('a hit continues on the next line', lineSegments(text, 1, 75, 10).filter((s) => s.mark).map((s) => s.text.length)
  .concat(lineSegments(text, 0, 75, 10).filter((s) => s.mark).map((s) => s.text.length)), [5, 5]);
eq('no hit on other lines', lineSegments(text, 5, 200, 23).length, 1);

// Keresés.
eq('normalize folds accents and drops the rest', normalizeQuery('Tlön, 1940'), { text: 'tlon, ', dropped: ['1', '9', '4', '0'] });
eq('describe changes', describeChanges('Tlön, 1940'), ['capitals lowered', 'ö read as o', '1940 left out: there are no numerals here']);
eq('nothing to describe', describeChanges('the unimaginable centre'), []);
eq('join with and', joinAnd(['a', 'b', 'c']), 'a, b and c');
const placed = placeQuery('the unimaginable centre', 'exact');
const placedText = getPageText(placed.address);
check('the placed line is on its page, at its start', placedText.slice(placed.start, placed.start + placed.length) === 'the unimaginable centre');
check('placement is deterministic', placeQuery('the unimaginable centre', 'exact').address === placed.address);

// Magyar: a sorszám a szó előtt, a számot sosem kell ragozni.
eq('hu place text', placeText(calculateHierarchy(at(5, 4, 4, 24, 88)), { lang: 'hu' }), '4. fal · 4. polc · 24. könyv · 88. oldal');
eq('hu turn labels', [turnLabel(p88, 1, true, 'hu'), turnLabel(p410, 1, true, 'hu'), turnLabel(N - 1n, 1, true, 'hu')],
  ['90–91. oldal', '25. könyv, 1. oldal', 'a nullás cím, 1. oldal']);
eq('hu match phrase', matchPhrase(200, 23, 'hu'), '3. sor, 41. karaktertől');
eq('hu describe changes', describeChanges('Tlön, 1940', 'hu'), ['nagybetű helyett kisbetű', '„ö” helyett „o”', '1940 kimarad, mert itt nincsenek számjegyek']);
eq('hu dropped characters are quoted and listed', describeChanges('a"b@c', 'hu'), ['„"”, „@” kimarad']);
eq('hu join', joinAnd(['a', 'b', 'c'], 'hu'), 'a, b és c');
check('hu edge note on page 410', edgeNote(p410, true, 'hu').startsWith('Ez a könyv utolsó oldala (24. könyv, 410. oldal).'));
eq('i18n: both languages have the same keys', missingKeys(), { hu: [], en: [] });
eq('hu ordinals', [1, 2, 5, 10, 11, 12, 20, 24, 30, 32].map(huOrdinal),
  ['első', 'második', 'ötödik', 'tizedik', 'tizenegyedik', 'tizenkettedik', 'huszadik', 'huszonnegyedik', 'harmincadik', 'harminckettedik']);
eq('hu walk caption picks a/az', translate('hu', 'walk.place', { wall: 1, shelf: 4, vol: 5 }, 3), 'Az első fal · a negyedik polc · az ötödik könyv');
eq('en walk caption unchanged', translate('en', 'walk.place', { wall: 4, shelf: 4, vol: 24 }, 3), 'The fourth wall · the fourth shelf · book twenty-four');

// „How far is it?” — hatszögrács szintenként, emeletek, héjas számozás, legrövidebb út.
const flat = (ps) => ps.map((p) => p.map((x) => (typeof x === 'string' ? x : x.plain ?? `${x.m}e${x.e}`)).join('')).join(' / ');
const para = (addr, lang, i) => flat(distanceParagraphs(addr, lang)).split(' / ')[i];
eq('distance: both languages have the same sentences', Object.keys(DISTANCE_LANGS.hu).sort(), Object.keys(DISTANCE_LANGS.en).sort());
eq('distance: both languages name the same directions', Object.keys(DISTANCE_LANGS.hu.dir).sort(), Object.keys(DIRS).sort());
eq('log10 of a 4800-digit number', Math.round(log10Big(10n ** 4800n * 3n) * 1000) / 1000, 4800.477);
eq('integer roots of 16000-bit numbers', [iroot(N) === 1n << 8000n, iroot(N - 1n) === (1n << 8000n) - 1n, iroot(99n), iroot(343n, 3n), iroot(342n, 3n)], [true, true, 9n, 7n, 6n]);

// A héjas számozás: az első (2k+1)³ hatszög pontosan a k sugarú tömb, mindegyik egyszer.
const seen = new Set();
let shellOk = true;
for (let n = 0n; n < 343n; n++) {
  const p = shellAt(n);
  const key = `${p.q},${p.r},${p.z}`;
  const m = [p.q, p.r, p.z].map((v) => (v < 0n ? -v : v)).reduce((a, v) => (v > a ? v : a));
  if (seen.has(key) || m !== p.shell || m > 3n) shellOk = false;
  seen.add(key);
}
check('shell numbering fills the 7×7×7 block once, shell by shell', shellOk && seen.size === 343);
check('…and hexagon 343 opens the next shell', shellAt(343n).shell === 4n);

// Legrövidebb út: Dijkstra a valódi gráfon — hatszögek, köztük folyosók (lépcső csak ott),
// és a négy ajtó —, összevetve a zárt alakkal, sok kiinduló pontból.
const keyOf = (...v) => v.join(',');
const BOX = 4;
const ZS = 3;
function dijkstra(src) {
  const dist = new Map([[keyOf('H', ...src), 0]]);
  const queue = [[0, 'H', ...src]];
  while (queue.length) {
    queue.sort((x, y) => x[0] - y[0]);
    const [d, kind, q, r, z] = queue.shift();
    if (d > dist.get(keyOf(kind, q, r, z)) + 1e-9) continue;
    const moves = [];
    if (kind === 'H') {
      moves.push(['L', q, r, z, STEP_S / 2], ['L', q - 1, r, z, STEP_S / 2]);
      for (const [dq, dr] of [[1, 1], [-1, -1], [0, 1], [0, -1]]) moves.push(['H', q + dq, r + dr, z, STEP_S]);
    } else {
      moves.push(['H', q, r, z, STEP_S / 2], ['H', q + 1, r, z, STEP_S / 2], ['L', q, r, z + 1, FLOOR_S], ['L', q, r, z - 1, FLOOR_S]);
    }
    for (const [k, nq, nr, nz, w] of moves) {
      if (Math.max(Math.abs(nq), Math.abs(nr)) > BOX + 3 || Math.abs(nz) > ZS + 1) continue;
      const key = keyOf(k, nq, nr, nz);
      if (!dist.has(key) || d + w < dist.get(key) - 1e-9) {
        dist.set(key, d + w);
        queue.push([d + w, k, nq, nr, nz]);
      }
    }
  }
  return dist;
}
let routeOk = true;
let bad = '';
for (const src of [[0, 0, 0], [2, -1, 1], [-3, 2, -1]]) {
  const dist = dijkstra(src);
  for (let q = -BOX; q <= BOX; q++) {
    for (let r = -BOX; r <= BOX; r++) {
      for (let z = -ZS; z <= ZS; z++) {
        const from = { q: BigInt(src[0]), r: BigInt(src[1]), z: BigInt(src[2]) };
        const route = shortestRoute(from, { q: BigInt(q), r: BigInt(r), z: BigInt(z) });
        const end = route.legs.reduce((p, [dir, n]) => (dir === 'floors'
          ? { ...p, z: p.z + n }
          : { q: p.q + DIRS[dir][0] * n, r: p.r + DIRS[dir][1] * n, z: p.z }), from);
        const want = dist.get(keyOf('H', q, r, z));
        // Sorban bejárható: az emeletváltás egy galéria menti (folyosós) szakasz után áll, vagy elöl, kitérővel.
        const fi = route.legs.findIndex(([dir]) => dir === 'floors');
        const walkable = fi < 0 || (route.hallDetour ? fi === 0 : ['forward', 'back'].includes(route.legs[fi - 1]?.[0]));
        if (!walkable) {
          routeOk = false;
          bad = `not walkable in order: ${src} → ${q},${r},${z}`;
        }
        if (Math.abs(route.seconds - want) > 1e-6 || end.q !== BigInt(q) || end.r !== BigInt(r) || end.z !== BigInt(z)) {
          routeOk = false;
          bad = `${src} → ${q},${r},${z}: ${route.seconds} vs ${want}`;
        }
      }
    }
  }
}
check('the closed-form route equals Dijkstra on the real graph and is walkable in order', routeOk, bad);
eq('hex distance', [hexDistance(3n, 2n), hexDistance(3n, -2n), hexDistance(-2n, -5n)], [3n, 5n, 5n]);

// A felépítés: minden sor könyvei sorban, egymást nem fedve, a polcon belül, az ajtót szabadon hagyva;
// a könyvek fölött marad hely, és semmi nem ér a mennyezetig.
for (const id of ['borges', 'dense']) {
  const ok = shelfRows(id).every((row) => {
    const xs = Array.from({ length: row.count }, (_, i) => volumeX(row.shelf, i + 1, id));
    const sorted = xs.every((x, i) => i === 0 || Math.abs(x - xs[i - 1]) >= BOOK.w - 1e-9 || (row.split && i === row.count / 2));
    const inWall = Math.max(...xs.map(Math.abs)) + BOOK.w / 2 <= BOARD_END + 1e-9;
    const clearOfDoor = !row.split || xs.every((x) => Math.abs(x) - BOOK.w / 2 >= DOOR_GAP / 2 - 1e-9);
    const below = row.y + 0.015 + BOOK.h < (row.split ? DOOR_H : FLOOR_H - 0.02);
    return sorted && inWall && clearOfDoor && below;
  });
  check(`${id}: every shelf holds whole books, in order, inside the wall, clear of the door`, ok);
}
eq('borges: 5 shelves of 32, 640 a hexagon', [shelfRows('borges').length, booksPerWall('borges'), booksPerHex('borges')], [5, 160, 640]);
eq('full walls: 9 shelves (3 × 104 above the door, 6 × 64 beside it)', shelfRows('dense').map((r) => r.count), [104, 104, 104, 64, 64, 64, 64, 64, 64]);
{
  const a = 123456789012345678901234567890n;
  const b = calculateHierarchy(a, 'borges');
  const d = calculateHierarchy(a, 'dense');
  check('the layout changes the place, not the page', b.page === d.page && (b.hex !== d.hex || b.wall !== d.wall || b.shelf !== d.shelf || b.vol !== d.vol));
  // Oda-vissza: a telt fal helyéből ugyanaz a cím.
  let back = true;
  for (let t = 0; t < 500; t++) {
    const addr = BigInt(t) * 7919n * 410n + BigInt(t % 410) + 10n ** 30n;
    const h = calculateHierarchy(addr, 'dense');
    const rows = shelfRows('dense');
    const idx = rows.slice(0, h.shelf - 1).reduce((n, r) => n + r.count, 0) + h.vol - 1;
    const hexN = [...h.hex].reduce((n, ch) => n * 36n + BigInt(parseInt(ch, 36)), 0n);
    const again = ((hexN * 4n + BigInt(h.wall - 1)) * BigInt(booksPerWall('dense')) + BigInt(idx)) * 410n + BigInt(h.page - 1);
    if (again !== addr) back = false;
  }
  check('full walls: place ↔ address round trip', back);
  const far = (id) => Math.floor(log10Big(howFar(placeQuery('the unimaginable centre', 'exact').address, id).route.steps));
  check('fuller walls make the library smaller (fewer hexagons, shorter ways)', far('dense') <= far('borges'), `${far('dense')} vs ${far('borges')}`);
  const cmp = (lang) => flat(distanceParagraphs(placeQuery('the unimaginable centre', 'exact').address, lang));
  check('how far: compares with the other layout (orders of magnitude apart)', /With full walls of shelves, this page would stand elsewhere: the way there on foot would be .* — shorter than the way as it is now by \d+ orders of magnitude\./.test(cmp('en')), cmp('en'));
  check('…in Hungarian without a suffix on the number', /Telt falakkal ez a lap máshol állna: oda gyalog .* volna az út — a mostaninál rövidebb, a különbség \d+ nagyságrend\./.test(cmp('hu')), cmp('hu'));
  // Közeli címnél a két út egy nagyságrenden belül van: ott százalék.
  const near = [...Array(400).keys()].map((i) => BigInt(i * 7 + 3) * pagesPerHex('borges'))
    .map((a) => flat(distanceParagraphs(a, 'hu'))).find((p) => /százaléka\./.test(p));
  check('…and a sensible percentage when the two ways are close', Boolean(near) && !/(^|\D)0 százaléka|∞/.test(near), near ?? 'none');
  setLayout('dense');
  check('turning labels follow the layout', typeof turnLabel(a, 1, true) === 'string');
  setLayout('borges');
}

eq('big number keeps small values written out', bigNumber(Math.log10(520), 'en'), { plain: '520', value: 520 });
eq('…but 999,999.6 is 1.0×10^6, not 1,000,000', bigNumber(Math.log10(999999.6), 'en'), { m: '1.0', e: 6 });
eq('big number rounds 9.96 up to the next power', bigNumber(Math.log10(9.96e20), 'en'), { m: '1.0', e: 21 });
eq('hu decimal comma', bigNumber(4811 + Math.log10(7.3), 'hu'), { m: '7,3', e: 4811 });
check('address 0 is hexagon 0', para(0n, 'en', 0) === 'This is hexagon 0, where the numbering begins.');
// Borges szerint (alapértelmezés): galéria × emeletek, négyzetes spirál, ajtó nélkül.
const atHex = (n, id) => BigInt(n) * pagesPerHex(id);
eq('Borges: the spiral starts at hexagon 0 and winds outward', [0n, 1n, 2n, 3n, 4n, 5n, 6n, 7n, 8n, 9n].map((n) => { const p = spiralAt(n); return `${p.q},${p.z}`; }),
  ['0,0', '1,0', '1,1', '0,1', '-1,1', '-1,0', '-1,-1', '0,-1', '1,-1', '2,-1']);
eq('Borges: hexagon 47 is along the gallery and down the stairs, nothing aside', [0, 2, 3].map((i) => para(atHex(47, 'borges'), 'en', i)), [
  'The number of this hexagon, counting from 0: 47. The label above gives the same number in base 36.',
  'The shortest way here from hexagon 0: 2 hexagons forward along the gallery and 3 floors down.',
  'On foot — five kilometres an hour, eighteen stairs to each floor, never resting: 1 minute.',
]);
eq('Borges: hexagon 3 is straight above — out to a hallway for the stairs', para(atHex(3, 'borges'), 'en', 2),
  'The shortest way here from hexagon 0: 1 floor up. There are no stairs in a hexagon: for those, out into a hallway and back.');
eq('Borges: hu route', para(atHex(47, 'borges'), 'hu', 2), 'A legrövidebb út ide a 0. hatszögtől: 2 hatszögnyit előre a galéria mentén és 3 emeletet lefelé.');
// A galériás bejárás legrövidebb útja = Dijkstra a lánc + lépcső gráfon: hatszögek és köztük
// folyosók (fél-fél lépés), lépcső csak a folyosókban.
{
  const key = (...v) => v.join(',');
  const dist = new Map([[key('H', 0, 0), 0]]);
  const queue = [[0, 'H', 0, 0]];
  while (queue.length) {
    queue.sort((x, y) => x[0] - y[0]);
    const [d, kind, q, z] = queue.shift();
    if (d > dist.get(key(kind, q, z)) + 1e-9) continue;
    const moves = kind === 'H'
      ? [['L', q, z, STEP_S / 2], ['L', q - 1, z, STEP_S / 2]]
      : [['H', q, z, STEP_S / 2], ['H', q + 1, z, STEP_S / 2], ['L', q, z + 1, FLOOR_S], ['L', q, z - 1, FLOOR_S]];
    for (const [k, nq, nz, w] of moves) {
      if (Math.abs(nq) > 9 || Math.abs(nz) > 6) continue;
      const id = key(k, nq, nz);
      if (!dist.has(id) || d + w < dist.get(id) - 1e-9) {
        dist.set(id, d + w);
        queue.push([d + w, k, nq, nz]);
      }
    }
  }
  let ok = true;
  for (let q = -6; q <= 6; q++) {
    for (let z = -4; z <= 4; z++) {
      const r = galleryRoute({ q: 0n, r: 0n, z: 0n }, { q: BigInt(q), r: 0n, z: BigInt(z) });
      if (Math.abs(r.seconds - dist.get(key('H', q, z))) > 1e-6 || r.legs.some(([dir]) => !['forward', 'back', 'floors'].includes(dir))) ok = false;
    }
  }
  check('Borges: the gallery route equals Dijkstra on the chain + stairs graph', ok);
}
const tlon = BigInt(placeQuery('tlon uqbar', 'exact').address);
const tb = howFar(tlon, 'borges');
check('Borges: a found line is ~10^2405 hexagons and floors away (a plane, √n)', Math.floor(log10Big(tb.route.steps)) === 2405 && tb.universeScale, `${log10Big(tb.route.steps)}`);
check('…and the single-gallery figure is kept for comparison', Math.floor(tb.lineMetresLog) === 4811, tb.lineMetresLog);
check('Borges: the library is one gallery √(hexagons) long', /The whole library: one gallery 3\.4e2405 hexagons long/.test(flat(distanceParagraphs(0n, 'en'))));

// Telt falak: rács ajtókkal, héjas számozás.
setLayout('dense');
eq('full walls: hexagon 47 — back, two floors down, back to the right', [0, 2].map((i) => para(atHex(47, 'dense'), 'en', i)), [
  'The number of this hexagon, counting from 0: 47. The label above gives the same number in base 36.',
  'The shortest way here from hexagon 0: 2 hexagons back along the gallery, 2 floors down and 2 hexagons back to the right.',
]);
eq('full walls: hexagon 5 is straight below — out to a hallway for the stairs', para(atHex(5, 'dense'), 'en', 2),
  'The shortest way here from hexagon 0: 1 floor down. There are no stairs in a hexagon: for those, out into a hallway and back.');
eq('full walls: hu route', para(atHex(47, 'dense'), 'hu', 2), 'A legrövidebb út ide a 0. hatszögtől: 2 hatszögnyit hátra a galéria mentén, 2 emeletet lefelé és 2 hatszögnyit jobbra hátra.');
const td = howFar(tlon, 'dense');
check('full walls: a found line is ~10^1603 away (a block, ∛n)', Math.floor(log10Big(td.route.steps)) === 1603 && td.universeScale, `${log10Big(td.route.steps)}`);
check('full walls: the library is ∛(hexagons) across', /The whole library: [\d.]+e1603 hexagons long, as many wide/.test(flat(distanceParagraphs(0n, 'en'))));
setLayout('borges');

for (const id of ['borges', 'dense']) {
  setLayout(id);
  for (const addr of [0n, atHex(47, id), atHex(5, id), tlon, N - 1n]) {
    const hu = flat(distanceParagraphs(addr, 'hu')).replace(/\d+e\d+/g, 'X').replace('Ez a 0. hatszög', '').replace('a 0. hatszögtől', '').replace('a 0. hatszögben', '');
    check(`${id}: hu never inflects a numeral (${String(addr).slice(0, 6)}…)`, !/\d(-|\.?[a-záéíóöőúüű])/.test(hu), hu);
  }
}
setLayout('borges');

// Léptetés a találatok között: a 0. a régi elhelyezés, a többi mind más lap, és mindegyiken ott a sor.
{
  const line = 'the unimaginable centre';
  const zero = placeQuery(line, 'exact');
  eq('result 0 is the original placement', placeQuery(line, 'exact', 0), zero);
  const results = [0, 1, 2, 3, 50].map((n) => placeQuery(line, 'exact', n));
  check('every result is a different page', new Set(results.map((r) => r.address.toString())).size === results.length);
  check('…and the line stands on each of them', results.every((r) => getPageText(r.address).slice(r.start, r.start + r.length) === line));
  check('whole-words results are framed by a space or punctuation', results.every((r) => {
    const page = getPageText(r.address);
    return (r.start === 0 || ' ,.?!-'.includes(page[r.start - 1])) && ' ,.?!-'.includes(page[r.start + r.length] ?? ' ');
  }));
}

if (failed > 0) {
  console.error(`\n${failed} check(s) failed.`);
  process.exit(1);
}
console.log('\nAll location checks passed.');
