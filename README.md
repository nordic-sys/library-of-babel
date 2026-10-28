# The Library of Babel

**https://babel.nordic-sys.com**

A computable version of the library in Jorge Luis Borges's story *La biblioteca de Babel* (1941):
every possible page of 3,200 characters is on a shelf, exactly once. Write a line, and the library
tells you the page it stands on — then walks you there.

- **Every page, nothing stored.** A page's text is computed from its address, and a page's address
  from its text: a bijection between the numbers 0 … 32<sup>3200</sup> − 1 and all possible pages.
- **Find a line.** Your line is placed deterministically, so the same search always leads to the same
  page and links never break; step through further results, the same line on other pages.
- **A real book.** 40 lines of 80 characters, true page spreads, the line underlined where it stands.
- **The walk.** A short engraved 3D walk through the galleries to the shelf (React Three Fiber, a
  hatching shader of its own); skippable, and absent with reduced motion.
- **How far is it?** The place of a page in human scale — walking time, light time, the shortest way —
  with a sketch of the route.
- **Two shelvings.** *As Borges wrote*: five shelves of 32 books to a wall, hexagons in one gallery
  joined only by hallways and stairs. *Full walls*: shelves from floor to ceiling, a door in every
  shelf wall. Same pages, different places.
- **English and Hungarian**, a paper and a lamplight theme, a page card to share and a print folio.
- **Private by design.** Everything runs in the browser: no server of its own, no account, cookie,
  analytics or tracking; kept pages stay in the browser's local storage.

## Running it

```sh
npm install
npm run dev      # http://localhost:5173
npm test         # address ↔ page round trip, places, routes, languages
npm run lint
npm run build    # static site in dist/
```

Requires a current Node.js (the CI uses Node 22). Pushing to `main` builds, tests and deploys the site
to GitHub Pages (`.github/workflows/pages.yml`).

## How it works

The design and the algorithms — the address ↔ page mapping, search placement, the hierarchy of
hexagon, wall, shelf, book and page, the geometry of the building, distances and shortest routes, and
the walk — are described in [`docs/DESIGN.md`](docs/DESIGN.md). The site's own *About* page explains
them too, with numbers computed live.

## License

MIT — see [`LICENSE`](LICENSE). Third-party typefaces and libraries are listed in
[`NOTICE.md`](NOTICE.md). This is an homage to Borges's story; the story itself is not part of it.
