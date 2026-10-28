/**
 * Fig. 1: a galériák alaprajza. Szabályos hatszögek parkettája; mindegyikben négy polcos fal
 * (az 1., 2., 4., 5. oldal — ugyanaz a kiosztás, mint a sétában) és a két szemközti szabad oldalon
 * folyosó (bennük a lépcső). Borges szerint a polcfalak épek, a szekrény a fal közepén áll; telt
 * falnál minden polcfal közepén keskeny, könyvekkel keretezett ajtó és rövid átjáró vezet a
 * szomszédba. Középen a légakna (szaggatott: a nagyon alacsony korlát). A cél-hatszög
 * rubrikapiros — ez az egyetlen piros a lapon, mert a piros mindig a helyet jelöli.
 */
import { BOARD_END, DOOR_GAP, DOOR_W, HALL_W, HEX_R, HEX_STEP, SHAFT_R, SHELF_DEPTH, TOP_LEN } from './geometry.js';
import { hasWallDoors, useLayout } from './layout.js';

const W = 440;
const H = 470;
/* Valódi arányok a `geometry.js`-ből: a hatszögek között 2,4 m tömör sáv, amit a hat átjáró tör meg. */
const R = 58; // a hatszög csúcssugara pixelben
const SCALE = R / HEX_R;
const STEP = HEX_STEP * SCALE; // szomszédos középpontok távolsága
const DX = STEP * (Math.sqrt(3) / 2);
const DY = STEP;
const GATES = [2, 5];
// A nyílás fél szélessége pixelben: a folyosó a szabad oldalon, a polcfal ajtaja keskenyebb.
// Állandó szélességű, a polcsoron át sem szűkül (a sétában is egyenes falú átjáró).
const halfOpening = (side) => ((GATES.includes(side) ? HALL_W : DOOR_W) / 2) * SCALE;

const vertex = (c, r, i) => {
  const a = (Math.PI / 3) * (i % 6);
  return [c.cx + r * Math.cos(a), c.cy + r * Math.sin(a)];
};
const lerp = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
const pts = (list) => list.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
const hex = (c, r) => pts([0, 1, 2, 3, 4, 5].map((i) => vertex(c, r, i)));
const seg = (p, q) => `M${p[0].toFixed(1)} ${p[1].toFixed(1)}L${q[0].toFixed(1)} ${q[1].toFixed(1)}`;

const cells = [];
for (let col = -1; col <= Math.ceil(W / DX) + 1; col++) {
  for (let row = -1; row <= Math.ceil(H / DY) + 1; row++) {
    cells.push({ cx: 30 + col * DX, cy: 18 + row * DY + (Math.abs(col) % 2 ? DY / 2 : 0) });
  }
}
const target = cells.reduce((best, c) =>
  (Math.hypot(c.cx - W / 2, c.cy - H / 2) < Math.hypot(best.cx - W / 2, best.cy - H / 2) ? c : best));

/*
 * Kitöltések (szekrények, átjárók) és tusvonalak, elrendezésenként egy menetben kiszámolva. Borges
 * szerint a polcfalak épek (a szekrény a fal közepén), átjáró csak a folyosóknál van; telt falnál
 * minden polcfal közepén ajtó, a polc a sarokig.
 */
function build(doors) {
  const cases = [];
  const halls = [];
  const stairs = [];
  let edges = '';
  for (const c of cells) {
    for (let side = 0; side < 6; side++) {
      const o1 = vertex(c, R, side);
      const o2 = vertex(c, R, side + 1);
      const len = Math.hypot(o2[0] - o1[0], o2[1] - o1[1]);
      const dir = [(o2[0] - o1[0]) / len, (o2[1] - o1[1]) / len];
      const phi = ((side + 0.5) * Math.PI) / 3;
      const inward = [-Math.cos(phi), -Math.sin(phi)];
      const gate = GATES.includes(side);
      const open = gate || doors;
      const hw = halfOpening(side);
      const at = (p, q, k) => { const m = lerp(p, q, 0.5); return [m[0] + dir[0] * k, m[1] + dir[1] * k]; };
      const oa = at(o1, o2, -hw);
      const ob = at(o1, o2, hw);
      edges += open ? seg(o1, oa) + seg(ob, o2) : seg(o1, o2);
      if (!gate) {
        // A polcok a fal síkjától befelé SHELF_DEPTH mélyen.
        const d = SHELF_DEPTH * SCALE;
        const spans = doors
          ? [[DOOR_GAP / 2, BOARD_END], [-BOARD_END, -DOOR_GAP / 2]]
          : [[-TOP_LEN / 2, TOP_LEN / 2]];
        for (const [from, to] of spans) {
          const a0 = at(o1, o2, from * SCALE);
          const a1 = at(o1, o2, to * SCALE);
          const b0 = [a0[0] + inward[0] * d, a0[1] + inward[1] * d];
          const b1 = [a1[0] + inward[0] * d, a1[1] + inward[1] * d];
          cases.push(pts([a0, a1, b1, b0]));
        }
      }
      // Az átjárót csak az egyik végéről rajzoljuk (5., 0., 1. oldal): egyenes, állandó szélességű
      // sáv a szomszéd szemközti oldaláig (annak felezőpontja a mienkkel egy vonalban van).
      if (open && (side === 5 || side === 0 || side === 1)) {
        const n = { cx: c.cx + DY * Math.cos(phi), cy: c.cy + DY * Math.sin(phi) };
        const na = at(vertex(n, R, side + 4), vertex(n, R, side + 3), -hw);
        const nb = at(vertex(n, R, side + 4), vertex(n, R, side + 3), hw);
        halls.push(pts([oa, ob, nb, na]));
        edges += seg(oa, na) + seg(ob, nb);
        // A folyosóban a csigalépcső, ugyanott, ahol a sétában: a folyosó közepétől 0,6 m-re a
        // galéria „jobb” oldala felé (a 2. oldal kifelé nézve; az 5.-ről nézve a bal, azaz phi − 90°).
        if (gate) {
          const mid = lerp(lerp(oa, ob, 0.5), lerp(na, nb, 0.5), 0.5);
          const along = [Math.cos(phi - Math.PI / 2), Math.sin(phi - Math.PI / 2)];
          stairs.push([mid[0] + along[0] * 0.6 * SCALE, mid[1] + along[1] * 0.6 * SCALE]);
        }
      }
    }
  }
  return { cases, halls, stairs, edges };
}
const PLANS = { borges: build(false), dense: build(true) };

export default function HexPlan({ label }) {
  const layout = useLayout();
  const { cases, halls, stairs, edges } = PLANS[hasWallDoors(layout) ? 'dense' : 'borges'];
  return (
    <svg
      className="plan-drawing"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={label}
    >
      <defs>
        {/* A tömör falazat: átlós tussraffozás, mint egy metszeten. */}
        <pattern id="plan-hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="4" height="4" className="plan-solid" />
          <line x1="0" y1="0" x2="0" y2="4" className="plan-hatch" />
        </pattern>
      </defs>
      <rect width={W} height={H} fill="url(#plan-hatch)" />
      {cells.map((c) => <polygon key={`r${c.cx}-${c.cy}`} points={hex(c, R)} className="plan-room" />)}
      {halls.map((p) => <polygon key={`h${p}`} points={p} className="plan-hall" />)}
      {cases.map((p) => <polygon key={`c${p}`} points={p} className="plan-walls plan-case" />)}
      <path d={edges} className="plan-edge" />
      {stairs.map(([x, y]) => <circle key={`s${x}-${y}`} cx={x} cy={y} r={0.5 * SCALE} className="plan-stair" />)}
      {cells.map((c) => <polygon key={`a${c.cx}-${c.cy}`} points={hex(c, SHAFT_R * SCALE)} className="plan-shaft" />)}
      <polygon points={hex(target, R * 1.06)} className="plan-target" />
    </svg>
  );
}
