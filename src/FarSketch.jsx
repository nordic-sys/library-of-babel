import { FLOOR_H, HEX_R, HEX_STEP } from './geometry.js';
import { DIRS, bigNumber, howFar, log10Big } from './distance.js';
import { useLang, useT } from './i18n.js';
import { topology, useLayout } from './layout.js';

/**
 * Fig. 2: a legrövidebb út a 0. hatszögtől idáig, tollrajzszerű vázlatként (`distance.js`
 * `shortestRoute`). Ferde vetület: előre jobbra, a galériák közti irány a néző felé, fel felfelé;
 * a kiinduló és a célszint padlósíkja szaggatott paralelogramma, a lépcső cikcakk.
 * A szakaszok egymáshoz képest arányosak (méterben: hatszög 8,3 m, emelet 3,1 m); ami a leghosszabb
 * tizedénél is rövidebb volna, azt hosszabbra rajzoljuk és ≈ jellel jelöljük. Közeli címnél a
 * megtett hatszögek és emeletek egyenként látszanak. A célhatszög rubrikapiros: a hely jelölése.
 */
const W = 380;
const H = 320;
const PAD = 40;
const MIN_SHARE = 0.12; // a legrövidebb kirajzolt szakasz a leghosszabbhoz képest
const FEW = 12; // ennyi lépésig hatszögenként rajzolunk
// A vetület: a padló két tengelye (előre, a néző felé ferdén) és a függőleges, képernyő-egységben.
const AX = { a: [1, 0], b: [-0.5, 0.42] };
const FLAT = 0.42; // a padlón fekvő hatszög lapítása

const abs = (v) => (v < 0n ? -v : v);
const project = ([pa, pb, pz]) => [pa * AX.a[0] + pb * AX.b[0], pa * AX.a[1] + pb * AX.b[1] - pz];

/* Egy padlón fekvő hatszög vázlata. */
function hexPoints([cx, cy], r) {
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i + Math.PI / 6;
    return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a) * FLAT).toFixed(1)}`;
  }).join(' ');
}

/* Kézzel húzott vonal: minden szakasz enyhén meghajlik, determinisztikusan. */
function sketchPath(points, seed = 1) {
  let d = `M${points[0][0].toFixed(1)} ${points[0][1].toFixed(1)}`;
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    const len = Math.hypot(x1 - x0, y1 - y0) || 1;
    const wob = Math.min(1.8, Math.max(0.4, len * 0.012)) * (((seed * 7 + i * 13) % 5) / 2 - 1);
    const mx = (x0 + x1) / 2 + (-(y1 - y0) / len) * wob;
    const my = (y0 + y1) / 2 + ((x1 - x0) / len) * wob;
    d += `Q${mx.toFixed(1)} ${my.toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`;
  }
  return d;
}

/* A lépcső: cikcakk a függőleges szakasz mentén. */
function stairPath([x0, y0], [x1, y1], teeth) {
  let d = `M${x0.toFixed(1)} ${y0.toFixed(1)}`;
  for (let i = 1; i <= teeth; i++) {
    const y = y0 + ((y1 - y0) * i) / teeth;
    const x = x0 + ((x1 - x0) * i) / teeth + (i % 2 ? 5 : -5) * (i < teeth ? 1 : 0);
    d += `L${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  return d;
}

/* Egy vízszintes szakasz felirata a merőleges mentén: a galéria menti alá, a ferde fölé — így a kettő nem ütközik. */
function hexLabelAt([x0, y0], [x1, y1], below) {
  const len = Math.hypot(x1 - x0, y1 - y0) || 1;
  let nx = -(y1 - y0) / len;
  let ny = (x1 - x0) / len;
  if ((ny > 0) !== below) {
    nx = -nx;
    ny = -ny;
  }
  const x = (x0 + x1) / 2 + nx * 12;
  const y = (y0 + y1) / 2 + ny * 12 + (below ? 10 : 0);
  return { x, y, textAnchor: Math.abs(nx) > 0.5 ? (nx < 0 ? 'end' : 'start') : 'middle' };
}

/* Szám SVG-szövegként: kiírva, vagy mantissza × 10 felső indexes kitevővel. */
function NumText({ n, unit }) {
  if (n.plain) return <tspan>{`${n.plain} ${unit}`}</tspan>;
  return (
    <>
      <tspan>{`${n.m} × 10`}</tspan>
      <tspan dy="-0.45em" fontSize="0.72em">{n.e}</tspan>
      <tspan dy="0.45em">{` ${unit}`}</tspan>
    </>
  );
}

export default function FarSketch({ addr }) {
  const t = useT();
  const lang = useLang();
  useLayout(); // az elrendezés váltásakor újrarajzol
  const f = howFar(addr);
  const legs = f.route.legs.map(([kind, n]) => {
    const count = abs(n);
    const metresLog = log10Big(count) + Math.log10(kind === 'floors' ? FLOOR_H : HEX_STEP);
    return { kind, count, sign: n < 0n ? -1 : 1, metresLog };
  });

  // Hosszak: arányosan a leghosszabbhoz, a túl rövidek megnyújtva.
  const maxLog = Math.max(...legs.map((l) => l.metresLog), Math.log10(HEX_STEP));
  const few = legs.length > 0 && legs.every((l) => l.count <= BigInt(FEW));
  for (const l of legs) {
    const share = 10 ** (l.metresLog - maxLog);
    l.share = Math.max(share, MIN_SHARE);
    l.stretched = share < MIN_SHARE;
  }

  // A pontok térben (előre, oldalra, fel), relatív egységben.
  const pts3 = [[0, 0, 0]];
  for (const l of legs) {
    const [a, b, z] = pts3[pts3.length - 1];
    if (l.kind === 'floors') pts3.push([a, b, z + l.sign * l.share]);
    else {
      const [dq, dr] = DIRS[l.kind];
      pts3.push([a + Number(dq) * l.share, b + Number(dr) * l.share, z]);
    }
  }
  // A két padlósík: a kiinduló és — ha más — a célszint, a vízszintes út köré.
  const margin = 0.16;
  const as = pts3.map((p) => p[0]);
  const bs = pts3.map((p) => p[1]);
  const [a0, a1, b0, b1] = [Math.min(...as) - margin, Math.max(...as) + margin, Math.min(...bs) - margin, Math.max(...bs) + margin];
  const zEnd = pts3[pts3.length - 1][2];
  const planes = [0, ...(zEnd !== 0 ? [zEnd] : [])].map((z) => [[a0, b0, z], [a1, b0, z], [a1, b1, z], [a0, b1, z]]);

  // Rajzlapra illesztés.
  const all = [...pts3, ...planes.flat()].map(project);
  const xs = all.map((p) => p[0]);
  const ys = all.map((p) => p[1]);
  const spanX = Math.max(...xs) - Math.min(...xs) || 1;
  const spanY = Math.max(...ys) - Math.min(...ys) || 1;
  const scale = Math.min((W - 2 * PAD) / spanX, (H - 2 * PAD - 24) / spanY);
  const ox = (W - spanX * scale) / 2 - Math.min(...xs) * scale;
  const oy = (H - 24 - spanY * scale) / 2 - Math.min(...ys) * scale;
  const toPx = (p3) => {
    const [x, y] = project(p3);
    return [ox + x * scale, oy + y * scale];
  };
  const P = pts3.map(toPx);

  // Egy rácslépés (hatszögről hatszögre) képpontban: közeli címnél a valódi lépték, egyébként
  // jelzésszerű. Ebből a hatszögek mérete és a kiinduló hatszög körüli szomszédok helye.
  const hexLeg = legs.find((l) => l.kind !== 'floors');
  const floorLeg = legs.find((l) => l.kind === 'floors');
  let unitPx = 30;
  if (few && hexLeg) unitPx = (hexLeg.share / Number(hexLeg.count)) * scale;
  else if (few && floorLeg) unitPx = (floorLeg.share / Number(floorLeg.count)) * (HEX_STEP / FLOOR_H) * scale;
  const roomR = Math.max(6, Math.min(18, unitPx * (HEX_R / HEX_STEP) * 1.15));

  // Közeli címnél a megtett hatszögek és emeletek egyenként.
  const stepMarks = [];
  if (few) {
    legs.forEach((l, i) => {
      const n = Number(l.count);
      for (let k = 1; k < n; k++) {
        const p = [P[i][0] + ((P[i + 1][0] - P[i][0]) * k) / n, P[i][1] + ((P[i + 1][1] - P[i][1]) * k) / n];
        stepMarks.push({ kind: l.kind, p, key: `${i}:${k}` });
      }
    });
  }
  // A kiinduló hatszög körül halvány szomszédok: a rács érzékeltetése.
  // Borges szerint csak a galéria két szomszédja érhető el, telt falnál mind a hat.
  const reachable = topology() === 'gallery' ? [DIRS.forward, DIRS.back] : Object.values(DIRS);
  const ghosts = reachable.map(([dq, dr]) => {
    const [x, y] = project([Number(dq), Number(dr), 0]);
    return [P[0][0] + x * unitPx, P[0][1] + y * unitPx];
  });
  const startLabelY = Math.max(P[0][1], ...ghosts.map((g) => g[1])) + roomR * FLAT + 16;

  // Léptékvonal: 60 px hány méter.
  const barPx = 60;
  let barLog = null;
  if (legs.length) {
    const i = legs.reduce((best, l, j) => (l.share > legs[best].share || (l.share === legs[best].share && !l.stretched) ? j : best), 0);
    const px = Math.hypot(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]);
    barLog = legs[i].metresLog + Math.log10(barPx / px);
  }

  const unit = (kind, count) => (kind === 'floors' ? t('far.unitFloor', count) : t('far.unitHex', count));
  const end = P[P.length - 1];

  return (
    <figure className="far-fig">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('far.figAria')} className="far-sketch">
        {planes.map((pl, i) => (
          <polygon key={i} points={pl.map((p) => toPx(p).map((v) => v.toFixed(1)).join(',')).join(' ')} className="far-plane" />
        ))}
        {ghosts.map((g, i) => <polygon key={`g${i}`} points={hexPoints(g, roomR)} className="far-room far-room--ghost" />)}
        <polygon points={hexPoints(P[0], roomR)} className={`far-room${legs.length ? '' : ' far-room--here'}`} />

        {stepMarks.map(({ kind, p, key }) => (kind === 'floors'
          ? <path key={key} d={`M${(p[0] - 8).toFixed(1)} ${p[1].toFixed(1)}h16`} className="far-tick" />
          : <polygon key={key} points={hexPoints(p, roomR)} className="far-room far-room--passed" />))}

        {legs.map((l, i) => (l.kind === 'floors'
          ? <path key={i} d={stairPath(P[i], P[i + 1], Math.max(4, Math.min(14, Math.round(Math.abs(P[i + 1][1] - P[i][1]) / 9))))} className="far-route far-route--stairs" />
          : <path key={i} d={sketchPath([P[i], P[i + 1]], i + 1)} className="far-route" />))}

        {legs.map((l, i) => {
          const [x0, y0] = P[i];
          const [x1, y1] = P[i + 1];
          const midX = (x0 + x1) / 2;
          const midY = (y0 + y1) / 2;
          const label = <NumText n={bigNumber(log10Big(l.count), lang)} unit={unit(l.kind, l.count)} />;
          return (
            <g key={i}>
              {l.stretched && <text x={midX} y={midY + 5} className="far-break" textAnchor="middle">≈</text>}
              {l.kind === 'floors'
                ? (midX > W - 140
                  // A jobb szélen balra kerül, a lépcső alsó részéhez, hogy a galéria menti felirattal ne ütközzön.
                  ? <text x={midX - 14} y={y0 + (y1 - y0) * 0.72 + 4} className="far-label" textAnchor="end">{label}</text>
                  : <text x={midX + 14} y={midY + 4} className="far-label">{label}</text>)
                : <text {...hexLabelAt(P[i], P[i + 1], l.kind === 'forward' || l.kind === 'back')} className="far-label">{label}</text>}
            </g>
          );
        })}

        <text x={P[0][0]} y={startLabelY} className="far-note" textAnchor="middle">{t('far.figStart')}</text>
        {legs.length > 0 && (
          <>
            <polygon points={hexPoints(end, roomR)} className="far-room far-room--here" />
            <text x={end[0] + roomR + 8} y={end[1] + 4} className="far-note far-note--here">{t('far.figHere')}</text>
          </>
        )}

        {barLog !== null && (
          <g className="far-scale">
            <path d={`M${PAD - 24} ${H - 14}h${barPx}M${PAD - 24} ${H - 18}v8M${PAD - 24 + barPx} ${H - 18}v8`} />
            <text x={PAD - 24 + barPx + 8} y={H - 10} className="far-note">
              <NumText n={bigNumber(barLog, lang)} unit={t('far.unitMetre')} />
            </text>
          </g>
        )}
      </svg>
      <figcaption>
        <span className="smallcaps">{t('far.figLabel')}</span> {t(`far.figCaption.${topology()}`)}
        {legs.some((l) => l.stretched) && <> {t('far.figStretched')}</>}
      </figcaption>
    </figure>
  );
}
