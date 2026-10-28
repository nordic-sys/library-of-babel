# Design

A short account of what the library is made of and why. The site's *About* page tells the same story
for readers, with its numbers computed live from the code.

## 1. Look: the “1941 edition”

A careful old edition of Borges: paper, ink and one rubric red. No glow, glass, gradients or icons.

- **Palette** (tokens at the top of `src/index.css`): paper `#EEE6D3`, table `#D6CCB6`, leaf `#F3ECDD`,
  ink `#1D1A16`, secondary `#4F483D` / `#6B6255`, rules `#C9BD9F`.
- **Rubric red `#8F2A19` marks the place and nothing else**: the found line, the target hexagon in
  Fig. 1, the ribbon of a kept page, the magnifier. Links, buttons and errors are never red.
- **Type**, self-hosted (no third-party font service): Libre Caslon Display for titles, EB Garamond
  for text, IBM Plex Mono for the page and for every number that is an address. The subset has no
  small caps, so small uppercase with letter-spacing stands in.
- **Lamplight** (dark theme): a dark table, the book's leaf stays paper, only dimmer; the walk turns
  into a scratchboard where the lines draw the light. Follows the system setting until chosen.
- **Controls**: underlined text links and a single solid ink button per page; a 2 px ink focus ring.

## 2. Pages and addresses (`src/core.js`)

A page is 3,200 characters from a 32-symbol alphabet (26 letters, space, `, . ? ! -`), so there are
N = 32<sup>3200</sup> = 2<sup>16000</sup> pages. An address is a number 0 … N − 1:

```
v1   = (address · M + OFFSET) mod 2^16000     affine mixing
v2   = v1 XOR (v1 >> 8000)                    fold the upper half onto the lower
page = the 3,200 five-bit digits of v2
```

Every step is invertible (M is odd; its inverse is found by Newton–Hensel iteration; the half-width
shift-XOR is an involution), so the mapping is a bijection: every page appears exactly once. M and
OFFSET are full-width constants from SplitMix64, so even small addresses give fully mixed pages. The
mixing is not cryptographic — it aims at completeness and reversibility, not secrecy. Changing the
constants changes every page, so the library carries an edition number (`LIBRARY_VERSION`), and
links from another edition are recognised.

## 3. Finding a line (`src/query.js`)

The line is folded into the alphabet (lower case, accents removed by NFD, anything else dropped, and
the reader is told what changed). It is then placed deterministically: a seed from FNV-1a of
`line|mode` drives xorshift32, which fills a page and picks a start; in *whole words* mode the line is
framed by a space or punctuation. The address is computed back from that page. Result *n* uses the
seed `line|mode|n`; result 0 keeps the original seed, so old links never change.

## 4. The place (`src/location.js`, `src/layout.js`)

An address is split in a mixed radix: page (410 per book), book, shelf, wall (4 shelf walls per
hexagon), hexagon (written in base 36). Books per shelf depend on the shelving:

- **As Borges wrote**: 5 shelves × 32 books per wall, 640 books per hexagon.
- **Full walls**: 9 rows per wall — 6 rows of 32 + 32 beside the door, 3 rows of 104 above it — 696
  per wall, 2,784 per hexagon.

The page and the address never depend on the shelving; only the place does. Open books show true
spreads (left even, right odd); turning moves two pages in the two-page view, one otherwise.

## 5. The building (`src/geometry.js`)

The story does not give sizes; these were calculated.

- The **airshaft** sets the size of a hexagon: shaft radius 1.6 m, a 1 m walkway and 34 cm deep shelves
  give an apothem of 2.94 m and walls 3.4 m long. Neighbouring hexagons are 8.29 m apart (a 2.4 m
  hallway or passage between them); a floor is 3.1 m.
- **Books of real size**: 410 pages are 205 leaves, about 2–3.5 cm bound; 40 lines of 80 characters
  make a page of about 17 × 24 cm. Here: 2.8 × 24 × 18 cm.
- **As Borges wrote**: the shelf walls are unbroken; in the middle of each stands a bookcase of five
  shelves of 32 books, about 2 m high, and the rest of the wall is bare (32 real books cannot fill it).
  One free side opens onto a hallway with a mirror and a spiral stair, leading to the next hexagon of
  the same gallery; galleries side by side never meet.
- **Full walls**: shelves from floor to ceiling, full of whole books with about 5 cm above them, and a
  door framed by books in the middle of every shelf wall. In a regular lattice every hexagon is the
  same, so if one wall needs a door, all do.

## 6. How far is it? (`src/distance.js`)

Hexagons are numbered outward from hexagon 0, and the shortest way there is computed in closed form:

- **As Borges wrote** — a vertical plane (gallery × floors), numbered in a square spiral: *n* hexagons
  fill a square √*n* on a side. The way is the steps along the gallery plus the floors; changing floor
  needs a hallway, so a way with no step along the gallery takes one step's detour.
- **Full walls** — a lattice: six neighbours on a floor (two hallways, four doors), numbered shell by
  shell, so *n* hexagons fill a block ∛*n* on a side. On a floor the number of steps is the hexagon
  distance (`max(|q|,|r|)` if q and r share a sign, `|q|+|r|` otherwise, axes 120° apart); floors add
  on, with the same hallway rule.

Walking is 5 km/h and 15 s a floor; light time uses the straight line. The tests compare both
closed forms with Dijkstra's algorithm on the real graphs (hexagon and hallway nodes, stairs only in
hallways; doors as well in the lattice). Numbers above 10<sup>6</sup> are shown as *m* × 10<sup>*e*</sup>; the sheet also compares
with the other shelving and with a single straight gallery. Fig. 2 sketches the route to scale.

## 7. The walk (`src/walk/`)

React Three Fiber with a hatching shader of its own (`engrave.js`): world-space hatching whose density
follows the light; every point takes the two lamps of its nearest hexagon on the lattice. One curve,
about eleven seconds: from two hexagons away and a floor up, down the spiral stair, past the mirror,
round the airshaft to the shelf, where the book slides out and the page opens. Eye level on the way,
looking down at most 10° and only on the stairs. Everything repeated is instanced. three.js is only
loaded by those who walk; Esc skips it, and with reduced motion there is no walk.

## 8. Reading, keeping, sharing

- The book is a real dialog: focus trap, Esc puts it back, ← → turn pages, ⇧← ⇧→ step between results,
  S keeps the page. Opening pushes one history entry; turning replaces it.
- Kept pages and the last page read live in `localStorage`, validated on read.
- A link opens the same page for anyone; a PNG page card is drawn on a canvas; the print stylesheet
  prints each visible page on its own A4 folio with its full address.

## 9. Languages (`src/i18n.js`)

English and Hungarian; every visible string comes from the dictionaries, and the tests fail if the two
key sets differ. Hungarian rule: no case suffix and no article choice directly after a computed numeral
(“88. oldal”, never “a 88. oldalon”), because the right form depends on how the number is pronounced.

## 10. Checks

`npm test` runs the address ↔ page round trip (`core.test.mjs`) and about a hundred checks of places,
page turning, search descriptions, languages, layouts and routes (`location.test.mjs`).
