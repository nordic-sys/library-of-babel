import { Component, memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { PAPER, RUBRIC, makeHatchMaterial, makeLineMaterial, setLattice, setTheme } from './engrave.js';
import {
  APOTHEM, BOOK, DOOR_GAP, DOOR_H, DOOR_W, FLOOR_H, HALL_L, HALL_W, HEX_R as R,
  HEX_STEP, LAMP_Y, LAMP_Z, SHAFT_R, SHELF_DEPTH, STAIR_STEPS,
} from '../geometry.js';
import { getLayout, hasWallDoors, rowCap, rowY, shelfRows, volumeX } from '../layout.js';
import { useT } from '../i18n.js';
import './walk.css';

/**
 * A séta rézkarc-stílusban.
 *
 * Egyetlen folytonos út, egy órával: két hatszöggel arrébb és egy emelettel feljebb indul, a
 * folyosó csigalépcsőjén lemegy, átvág a következő hatszögön, elhalad a tükör előtt, a
 * célhatszögben az aknát íven megkerülve egyenesen a polchoz megy (megállás nélkül); ott a kötet
 * kicsúszik, a kép papírszínbe vált. A kamera, a kötet és a felirat ugyanabból az időből számol.
 */
const MOVE_S = 8.6; // a mozgás: indulástól a polcig
const AFTER_S = 2.1; // a polcnál: a kötet kicsúszik, papírszínbe vált
export const WALK_DURATION_S = MOVE_S + AFTER_S;
const EYE = 1.55;

const RAIL_H = 0.36; // Borges: a korlát nagyon alacsony
const WALL_SIDES = [0, 1, 3, 4];
const GATE_SIDES = [2, 5];
const HEXES = [-2, -1, 0, 1]; // a galéria hatszögei; a célhatszög a 0.; a séta a -2.-ből indul
const STAIR_R = 0.36;
const WALK_R = 2.1; // a járógyűrű sugara: az akna korlátja (1,6) és a polcok (2,6) között
const NEIGHBOUR_FLOORS = [-1, 0, 1]; // az ajtókon át látszó szomszédokból csak ennyi emelet

/** Egy hatszögoldal kerete: a fal közepe, a kifelé mutató normál és a fal menti „jobb”. */
function sideFrame(side) {
  const phi = ((side + 0.5) * Math.PI) / 3;
  const out = new THREE.Vector3(Math.cos(phi), 0, Math.sin(phi));
  const theta = Math.atan2(-out.x, -out.z);
  const right = new THREE.Vector3(Math.cos(theta), 0, -Math.sin(theta));
  return { out, theta, right, center: out.clone().multiplyScalar(APOTHEM) };
}

// A kapuk tengelye: a hatszögek e mentén fűződnek láncba, folyosókkal (Borges: a szabad oldalak
// egyike keskeny folyosóra nyílik, amely egy másik, az elsővel azonos galériába vezet).
const G = sideFrame(GATE_SIDES[0]).out;
const RG = sideFrame(GATE_SIDES[0]).right;
const H60 = sideFrame(3).out; // a rács másik tengelye: az ajtók egyike, 60°-ra a galériától
const hexCenter = (k) => G.clone().multiplyScalar(k * HEX_STEP);
const hallCenter = (k) => hexCenter(k).add(G.clone().multiplyScalar(APOTHEM + HALL_L / 2));
const stairCenter = (k) => hallCenter(k).add(RG.clone().multiplyScalar(0.6));
const yawFacing = (n) => Math.atan2(n.x, n.z);
setLattice(G, H60, HEX_STEP);

const smooth = (a, b, t) => {
  const x = Math.min(Math.max((t - a) / (b - a), 0), 1);
  return x * x * (3 - 2 * x);
};
const angleOf = (v) => Math.atan2(v.z, v.x);
const at2 = (base, alongG, alongR, y) => base.clone()
  .add(G.clone().multiplyScalar(alongG)).add(RG.clone().multiplyScalar(alongR)).setY(y);

function hexShape(radius) {
  const s = new THREE.Shape();
  for (let k = 0; k < 6; k++) {
    const a = (k * Math.PI) / 3;
    if (k === 0) s.moveTo(radius * Math.cos(a), radius * Math.sin(a));
    else s.lineTo(radius * Math.cos(a), radius * Math.sin(a));
  }
  s.closePath();
  return s;
}

/**
 * Az út egyetlen görbe: a -2. hatszögből (egy emelettel feljebb) a folyosó csigalépcsőjén le,
 * a -1. hatszögön és a tükrös folyosón át, a célhatszögben a járógyűrűn (WALK_R) az akna körül, majd
 * egyenesen a célpolc elé. A korláthoz nem megy oda, nem áll meg.
 */
function buildPath(f, vx, bookY) {
  const yTop = FLOOR_H + EYE;
  const pts = [];

  // 1. A -2. hatszög, egy emelettel feljebb: az akna mellett a kapu felé.
  const h2 = hexCenter(-2);
  pts.push(at2(h2, -1.0, 2.0, yTop), at2(h2, 0.9, 2.0, yTop), at2(h2, APOTHEM - 0.5, 0.2, yTop));

  // 2. Folyosó + csigalépcső: a lépcső körül, a fal felőli hosszabbik íven, egy emeletnyit le.
  const hall = hallCenter(-2);
  const sc = stairCenter(-2);
  const entry = at2(hall, -0.95, -0.15, yTop);
  const exit = at2(hall, 0.95, -0.15, EYE);
  pts.push(entry);
  const a0 = angleOf(entry.clone().sub(sc));
  const a1 = angleOf(exit.clone().sub(sc));
  let sweep = a1 - a0;
  while (sweep <= 0) sweep += Math.PI * 2;
  if (sweep < Math.PI) sweep += Math.PI * 2;
  const rr = STAIR_R * 1.4;
  for (let i = 1; i < 12; i++) {
    const u = i / 12;
    const a = a0 + sweep * u;
    pts.push(new THREE.Vector3(sc.x + Math.cos(a) * rr, yTop - u * FLOOR_H, sc.z + Math.sin(a) * rr));
  }
  pts.push(exit);

  // 3. A -1. hatszög: most a másik oldalon kerüli az aknát.
  const h1 = hexCenter(-1);
  pts.push(at2(h1, -(APOTHEM - 0.5), -0.3, EYE), at2(h1, -0.9, -2.0, EYE), at2(h1, 0.9, -2.0, EYE), at2(h1, APOTHEM - 0.5, -0.5, EYE));

  // 4. A tükrös folyosó (a lépcső másik oldalán), be a célhatszögbe.
  const hallB = hallCenter(-1);
  pts.push(at2(hallB, -0.8, -0.55, EYE), at2(hallB, 0.8, -0.55, EYE));
  const door = at2(hexCenter(0), -(APOTHEM - 0.4), -0.4, EYE);
  pts.push(door);
  const doorIndex = pts.length - 1;

  // 5. A célhatszögben a járógyűrűn az akna körül addig, ahonnan egyenesen a polchoz lehet menni.
  const side = f.center.clone().normalize();
  const turn = side.clone().multiplyScalar(-0.3).add(f.right.clone().multiplyScalar(vx >= 0 ? 1.4 : -1.4));
  const aDoor = angleOf(door);
  let d = angleOf(turn) - aDoor;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  const n = Math.max(2, Math.ceil(Math.abs(d) / (Math.PI / 6)));
  for (let i = 1; i <= n; i++) {
    const a = aDoor + (d * i) / n;
    pts.push(new THREE.Vector3(Math.cos(a) * WALK_R, EYE, Math.sin(a) * WALK_R));
  }
  // A polc elé áll; a szem magassága 0,55 és 1,75 m között marad — a magas polcokhoz felnéz.
  const standY = Math.min(Math.max(bookY + 0.12, 0.55), 1.75);
  pts.push(f.center.clone().add(side.clone().multiplyScalar(-1.0)).add(f.right.clone().multiplyScalar(vx)).setY(standY));

  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const length = curve.getLength();
  const lengths = curve.getLengths(pts.length * 40);
  const sDoor = lengths[doorIndex * 40];

  const mirror = at2(hallB, 0, -(HALL_W / 2 - 0.05), 1.5);
  let uMirror = 0;
  let best = Infinity;
  for (let i = 0; i <= 400; i++) {
    const dist = curve.getPointAt(i / 400).distanceTo(mirror);
    if (dist < best) { best = dist; uMirror = i / 400; }
  }
  return { curve, length, mirror, uMirror, uDoor: sDoor / length };
}

/**
 * Sebességprofil: 0,8 mp gyorsítás, egyenletes menet, 1,4 mp lassítás a polcnál.
 * Az út hosszától függetlenül MOVE_S alatt ér a polchoz.
 */
const ACC = 0.8;
const DEC = 1.4;
function arcAt(length, t) {
  const v = length / (MOVE_S - ACC / 2 - DEC / 2);
  if (t <= 0) return 0;
  if (t < ACC) return (0.5 * v * t * t) / ACC;
  if (t < MOVE_S - DEC) return v * (ACC / 2) + v * (t - ACC);
  if (t < MOVE_S) return length - (0.5 * v * (MOVE_S - t) ** 2) / DEC;
  return length;
}

/** Előrenézés menet közben: 2,5 egységgel előre a görbén, szemmagasságban; a tükörnél odapillant. */
function aheadLook(path, u) {
  const pos = path.curve.getPointAt(u);
  const ahead = path.curve.getPointAt(Math.min(u + 2.5 / path.length, 1));
  let look = ahead.distanceTo(pos) > 0.8
    ? ahead
    : pos.clone().add(path.curve.getTangentAt(Math.min(u, 0.999)).multiplyScalar(2.5));
  // A lépcsőn csak félig követi a lejtést, és legfeljebb 10°-ot néz lefelé; egyébként vízszintesen.
  const horiz = Math.hypot(look.x - pos.x, look.z - pos.z);
  look = look.setY(Math.max(pos.y + (look.y - pos.y) * 0.5, pos.y - horiz * Math.tan(THREE.MathUtils.degToRad(10))));
  const glance = Math.exp(-(((u - path.uMirror) / 0.035) ** 2));
  return look.lerp(path.mirror, 0.65 * glance);
}

/** Az egész út és a hozzá tartozó időpontok. */
function buildPlan(hierarchy, layout = getLayout()) {
  const side = WALL_SIDES[(hierarchy.wall - 1) % 4];
  const f = sideFrame(side);
  const vx = volumeX(hierarchy.shelf, hierarchy.vol, layout);
  const bookY = rowY(hierarchy.shelf, layout) + 0.015 + BOOK.h / 2;
  const path = buildPath(f, vx, bookY);

  // Mikor lép be a célhatszögbe? (a sebességprofil megfordításával)
  let tDoor = 0;
  while (tDoor < MOVE_S && arcAt(path.length, tDoor) < path.uDoor * path.length) tDoor += 0.02;

  return {
    layout, side, frame: f, vx, bookY, path, tDoor,
    book: f.center.clone().add(f.out.clone().multiplyScalar(-0.15))
      .add(f.right.clone().multiplyScalar(vx)).setY(bookY),
    lookWall: f.center.clone().setY(1.45),
    lookShelf: f.center.clone().add(f.right.clone().multiplyScalar(vx * 0.6)).setY(bookY),
  };
}

/** A felirat állapota: -1 = úton, 0 = a célhatszögben, 1–3 = fal · polc · kötet. */
function stepAt(plan, t) {
  if (t >= MOVE_S - 0.2) return 3;
  if (t >= MOVE_S - 1.2) return 2;
  if (t >= plan.tDoor + 0.8) return 1;
  if (t >= plan.tDoor - 0.4) return 0;
  return -1;
}

/** Kamera és kötet egy adott időpillanatban — tiszta függvény, a képkockák ebből jönnek. */
function poseAt(plan, t) {
  const u = arcAt(plan.path.length, Math.min(t, MOVE_S)) / plan.path.length;
  const pos = plan.path.curve.getPointAt(u);
  // A célhatszögben előbb a falra, aztán a polcra, végül a kötetre fordul — közben megy tovább.
  const look = aheadLook(plan.path, u)
    .lerp(plan.lookWall, smooth(plan.tDoor + 0.2, plan.tDoor + 1.3, t))
    .lerp(plan.lookShelf, smooth(MOVE_S - 1.8, MOVE_S - 0.8, t))
    .lerp(plan.book, smooth(MOVE_S - 1.0, MOVE_S, t));
  pos.add(plan.frame.out.clone().multiplyScalar(0.18 * smooth(MOVE_S + 0.2, MOVE_S + 1.8, t)));

  const slide = 0.24 * smooth(MOVE_S + 0.1, MOVE_S + 1.0, t);
  const lift = 0.05 * smooth(MOVE_S + 0.6, MOVE_S + 1.2, t);
  return { pos, look, slide, lift };
}

/** Gyengébb gépen kevesebb ismételt emelet és 1-es DPR (a köd úgyis elnyeli a távolit). */
function qualityTier() {
  const cores = navigator.hardwareConcurrency ?? 8;
  const coarse = window.matchMedia?.('(pointer: coarse)').matches;
  return cores <= 4 || coarse
    ? { floors: [-1, 0, 1, 2], dpr: 1 }
    : { floors: [-3, -2, -1, 0, 1, 2, 3], dpr: [1, 1.75] };
}

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

function useInstances(ref, list) {
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    list.forEach((it, i) => mesh.setMatrixAt(i, it.matrix));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [ref, list]);
}

/* A kirajzolt hatszögek: a galéria (minden emeleten) és az ajtókon át látszó szomszédjaik. */
function buildCells(floors, doors) {
  const cells = HEXES.map((k) => ({ k, c: hexCenter(k), floors }));
  // Borges szerint nincs ajtó a polcfalakon: a galérián kívül semmi sem látszik.
  if (!doors) return cells;
  const seen = new Set(cells.map(({ c }) => `${c.x.toFixed(2)},${c.z.toFixed(2)}`));
  for (const k of HEXES) {
    for (const side of WALL_SIDES) {
      const c = hexCenter(k).add(sideFrame(side).out.multiplyScalar(HEX_STEP));
      const key = `${c.x.toFixed(2)},${c.z.toFixed(2)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      cells.push({ k: null, c, floors: floors.filter((fl) => NEIGHBOUR_FLOORS.includes(fl)) });
    }
  }
  return cells;
}

/* Egyedi elemek (folyosók, ajtós átjárók) a két végük felezőpontja szerint. */
function uniqueBy(list, at) {
  const seen = new Map();
  for (const item of list) {
    const key = `${at(item).x.toFixed(2)},${at(item).z.toFixed(2)}`;
    const prev = seen.get(key);
    if (!prev || item.floors.length > prev.floors.length) seen.set(key, item);
  }
  return [...seen.values()];
}

const Floors = memo(function Floors({ plan, floors }) {
  const mats = useMemo(() => ({
    book: makeHatchMaterial({ spacing: 0.006, tone: true }),
    wood: makeHatchMaterial({ spacing: 0.012, base: 0.05 }),
    wall: makeHatchMaterial({ spacing: 0.014, outline: false, base: 0.04 }),
    slab: makeHatchMaterial({ spacing: 0.016, outline: false, base: 0.12, side: THREE.DoubleSide }),
    lamp: makeHatchMaterial({ outline: false, silhouette: true, base: 1.2 }),
    mirror: makeHatchMaterial({ spacing: 0.008, base: 0.9 }),
    line: makeLineMaterial(),
  }), []);

  const geo = useMemo(() => {
    const slabShape = hexShape(R + 0.02);
    slabShape.holes.push(hexShape(SHAFT_R));
    const slab = new THREE.ExtrudeGeometry(slabShape, { depth: 0.1, bevelEnabled: false });
    slab.rotateX(-Math.PI / 2);
    return {
      book: new THREE.BoxGeometry(BOOK.w, BOOK.h, BOOK.d),
      jamb: new THREE.BoxGeometry(0.05, DOOR_H, SHELF_DEPTH),
      plane: new THREE.PlaneGeometry(1, 1), // falelemek: példányonként méretezve
      box: new THREE.BoxGeometry(1, 1, 1), // padlók: példányonként méretezve
      rail: new THREE.BoxGeometry(SHAFT_R, 0.04, 0.05),
      post: new THREE.BoxGeometry(0.05, RAIL_H, 0.05),
      step: new THREE.BoxGeometry(0.55, 0.05, 0.22),
      pole: new THREE.CylinderGeometry(0.035, 0.035, FLOOR_H, 8),
      lamp: new THREE.SphereGeometry(0.17, 24, 16),
      mirror: new THREE.BoxGeometry(0.7, 1.3, 0.03),
      slab,
      slabEdges: new THREE.EdgesGeometry(slab),
    };
  }, []);

  useEffect(() => () => {
    Object.values(geo).forEach((g) => g.dispose());
    Object.values(mats).forEach((m) => m.dispose());
  }, [geo, mats]);

  // Minden példányosítva: a hatszögek, a folyosók és az átjárók minden kirajzolt emeleten.
  const scene = useMemo(() => {
    const out = {
      books: [], wood: [], jambs: [], walls: [], floorsBox: [], slabsBox: [],
      rails: [], posts: [], steps: [], poles: [], mirrors: [], lamps: [], cords: [], slabs: [],
    };
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const one = new THREE.Vector3(1, 1, 1);
    const yAxis = new THREE.Vector3(0, 1, 0);
    const put = (list, p, yaw, scale = one, pitch = 0, extra = {}) => {
      q.setFromEuler(e.set(pitch, yaw, 0, 'YXZ'));
      list.push({ matrix: m.clone().compose(p, q, scale), ...extra });
    };
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const doors = hasWallDoors(plan.layout);
    const cells = buildCells(floors, doors);

    for (const { k, c: hc, floors: fls } of cells) {
      for (const fl of fls) {
        const y0 = fl * FLOOR_H;
        out.slabs.push({ p: new THREE.Vector3(hc.x, y0, hc.z), key: `${hc.x.toFixed(2)}:${hc.z.toFixed(2)}:${fl}` });
        for (const side of WALL_SIDES) {
          const f = sideFrame(side);
          // A fal síkja mentén: x a fal mentén (jobbra +), z befelé a faltól.
          const at = (x, y, z) => f.center.clone().add(hc).add(f.right.clone().multiplyScalar(x))
            .add(f.out.clone().multiplyScalar(-z)).setY(y0 + y);
          // A polcozás az elrendezés soraiból (`layout.js`): minden sor egy vagy két szakasz (az ajtó két
          // oldalán), polclappal, könyvekkel és két oldaldeszkával; fedlap ott, ahol közvetlenül fölötte
          // nincs másik sor. A telt falon a szomszéd hatszögekben csak a séta szintjén vannak könyvek.
          const rows = shelfRows(plan.layout);
          // Telt falnál a könyvek száma tízszeres: a galériában csak a középső öt szinten, a szomszédokban a séta
          // két szintjén (az indulás egy emelettel feljebb van) rajzoljuk ki őket; a polcozás mindenhol látszik.
          const withBooks = plan.layout === 'borges' || (k !== null ? Math.abs(fl) <= 2 : fl === 0 || fl === 1);
          const rowTop = rowCap;
          rows.forEach((row, ri) => {
            const centres = row.split ? [-1, 1].map((sgn) => sgn * (DOOR_GAP / 2 + row.len / 2)) : [0];
            const above = rows[ri - 1];
            const capped = !above || above.y - row.y > 0.45 || above.split !== row.split;
            for (const cx of centres) {
              put(out.wood, at(cx, row.y, 0.17), f.theta, new THREE.Vector3(row.len, 0.03, SHELF_DEPTH));
              // Az oldaldeszka a fölötte lévő sorig ér, ha az ugyanilyen (egy szekrény egy darab).
              const top = capped ? rowTop(row) : above.y - 0.015;
              for (const end of [-1, 1]) {
                // Az osztott sor ajtó felőli végén az ajtófélfa a szekrény oldala.
                if (row.split && Math.sign(cx) === -end) continue;
                const h = top - (row.y - 0.015);
                put(out.wood, at(cx + end * (row.len / 2 + 0.015), row.y - 0.015 + h / 2, 0.17), f.theta, new THREE.Vector3(0.03, h, SHELF_DEPTH));
              }
              if (capped) put(out.wood, at(cx, rowTop(row), 0.17), f.theta, new THREE.Vector3(row.len + 0.06, 0.03, SHELF_DEPTH));
            }
            if (!withBooks) return;
            for (let v = 1; v <= row.count; v++) {
              const target = k === 0 && fl === 0 && side === plan.side && row.shelf === plan.hierarchy.shelf && v === plan.hierarchy.vol;
              if (target) continue;
              put(out.books, at(volumeX(row.shelf, v, plan.layout), row.y + 0.015 + BOOK.h / 2, 0.16), f.theta, one, 0, { tone: 0.82 + rnd() * 0.3 });
            }
          });
          if (!doors) {
            // Ép polcfal (Borges szerint).
            put(out.walls, at(0, FLOOR_H / 2, -0.02), f.theta, new THREE.Vector3(R, FLOOR_H - 0.1, 1));
          } else {
            for (const sgn of [-1, 1]) {
              put(out.jambs, at(sgn * (DOOR_GAP / 2 - 0.03), DOOR_H / 2, 0.17), f.theta);
              // A fal az ajtó két oldalán, és a szemöldök fölötte.
              const wallW = (R - DOOR_W) / 2;
              put(out.walls, at(sgn * (DOOR_W / 2 + wallW / 2), FLOOR_H / 2, -0.02), f.theta, new THREE.Vector3(wallW, FLOOR_H - 0.1, 1));
            }
            put(out.walls, at(0, (DOOR_H + FLOOR_H - 0.05) / 2, -0.02), f.theta, new THREE.Vector3(DOOR_W, FLOOR_H - 0.05 - DOOR_H, 1));
          }
        }
        // Az akna korlátja.
        for (let i = 0; i < 6; i++) {
          const a0 = (i * Math.PI) / 3;
          const a1 = ((i + 1) * Math.PI) / 3;
          const v0 = new THREE.Vector3(SHAFT_R * Math.cos(a0), 0, SHAFT_R * Math.sin(a0)).add(hc);
          const v1 = new THREE.Vector3(SHAFT_R * Math.cos(a1), 0, SHAFT_R * Math.sin(a1)).add(hc);
          const mid = v0.clone().add(v1).multiplyScalar(0.5);
          const yaw = Math.atan2(-(v1.z - v0.z), v1.x - v0.x);
          put(out.rails, mid.setY(y0 + 0.1 + RAIL_H), yaw);
          put(out.posts, v0.clone().setY(y0 + 0.1 + RAIL_H / 2), yaw);
        }
        // A két lámpa és a zsinórja.
        for (const z of [LAMP_Z, -LAMP_Z]) {
          put(out.lamps, new THREE.Vector3(hc.x, y0 + LAMP_Y, hc.z + z), 0);
          out.cords.push(hc.x, y0 + LAMP_Y + 0.17, hc.z + z, hc.x, y0 + FLOOR_H, hc.z + z);
        }
        // A kapuk mellett falcsonkok.
        for (const side of GATE_SIDES) {
          const f = sideFrame(side);
          const stubW = R / 2 - HALL_W / 2;
          for (const sgn of [-1, 1]) {
            const p = f.center.clone().add(hc).add(f.right.clone().multiplyScalar(sgn * (HALL_W / 2 + stubW / 2))).setY(y0 + FLOOR_H / 2);
            put(out.walls, p, f.theta, new THREE.Vector3(stubW, FLOOR_H - 0.1, 1));
          }
        }
      }
    }

    // Folyosók a galéria mentén (mindkét irányban, minden kirajzolt hatszögnél): két fal, a
    // járósáv padlója, tükör, lépcsőoszlop és a csigalépcső.
    const halls = uniqueBy(cells.flatMap(({ c, floors: fls }) => [-1, 1].map((sgn) => ({
      c: c.clone().add(G.clone().multiplyScalar(sgn * (APOTHEM + HALL_L / 2))), floors: fls,
    }))), (h) => h.c);
    for (const { c, floors: fls } of halls) {
      const sc = c.clone().add(RG.clone().multiplyScalar(0.6));
      for (const fl of fls) {
        const y0 = fl * FLOOR_H;
        for (const sgn of [-1, 1]) {
          const p = c.clone().add(RG.clone().multiplyScalar(sgn * HALL_W / 2)).setY(y0 + FLOOR_H / 2);
          put(out.walls, p, yawFacing(RG.clone().multiplyScalar(-sgn)), new THREE.Vector3(HALL_L, FLOOR_H - 0.1, 1));
        }
        // Csak a járósáv (a tükör felőli fél): a lépcső felőli oldalon a födém nyitott lépcsőszem.
        put(out.floorsBox, c.clone().add(RG.clone().multiplyScalar(-HALL_W / 4)).setY(y0 + 0.05), yawFacing(G), new THREE.Vector3(HALL_W / 2, 0.1, HALL_L));
        put(out.mirrors, c.clone().add(RG.clone().multiplyScalar(-(HALL_W / 2 - 0.03))).setY(y0 + 1.45), yawFacing(RG));
        put(out.poles, sc.clone().setY(y0 + FLOOR_H / 2), 0);
        // Emeletenként egy teljes fordulat, 18 fok.
        for (let i = 0; i < STAIR_STEPS; i++) {
          const a = (i / STAIR_STEPS) * Math.PI * 2;
          const p = sc.clone().add(new THREE.Vector3(Math.cos(a) * 0.33, 0, Math.sin(a) * 0.33));
          p.y = y0 + 0.1 + (i / STAIR_STEPS) * FLOOR_H;
          q.setFromAxisAngle(yAxis, -a);
          out.steps.push({ matrix: m.clone().compose(p, q, one) });
        }
      }
    }

    // Az ajtók mögötti átjárók: két oldalfal, mennyezet a szemöldök magasságában, padló.
    const passages = !doors ? [] : uniqueBy(cells.flatMap(({ c, floors: fls }) => WALL_SIDES.map((side) => ({
      c: c.clone().add(sideFrame(side).out.multiplyScalar(APOTHEM + HALL_L / 2)), out: sideFrame(side).out, floors: fls,
    }))), (pa) => pa.c);
    for (const { c, out: dir, floors: fls } of passages) {
      const across = new THREE.Vector3(-dir.z, 0, dir.x);
      for (const fl of fls) {
        const y0 = fl * FLOOR_H;
        for (const sgn of [-1, 1]) {
          const p = c.clone().add(across.clone().multiplyScalar(sgn * DOOR_W / 2)).setY(y0 + DOOR_H / 2);
          put(out.walls, p, yawFacing(across.clone().multiplyScalar(-sgn)), new THREE.Vector3(HALL_L, DOOR_H, 1));
        }
        put(out.walls, c.clone().setY(y0 + DOOR_H), yawFacing(dir), new THREE.Vector3(DOOR_W, HALL_L, 1), Math.PI / 2);
        put(out.floorsBox, c.clone().setY(y0 + 0.05), yawFacing(dir), new THREE.Vector3(DOOR_W, 0.1, HALL_L));
      }
    }
    return out;
  }, [plan, floors]);

  useLayoutEffect(() => {
    geo.book.setAttribute('aTone', new THREE.InstancedBufferAttribute(
      new Float32Array(scene.books.map((b) => b.tone)), 1));
  }, [geo, scene]);

  const cordGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(scene.cords, 3));
    return g;
  }, [scene]);
  useEffect(() => () => cordGeo.dispose(), [cordGeo]);

  const kinds = [
    ['books', geo.book, mats.book], ['wood', geo.box, mats.wood], ['jambs', geo.jamb, mats.wood],
    ['walls', geo.plane, mats.wall],
    ['floorsBox', geo.box, mats.slab], ['rails', geo.rail, mats.wood], ['posts', geo.post, mats.wood],
    ['steps', geo.step, mats.wood], ['poles', geo.pole, mats.wood], ['mirrors', geo.mirror, mats.mirror],
    ['lamps', geo.lamp, mats.lamp],
  ];

  return (
    <group>
      {kinds.map(([name, g, mat]) => <Instances key={name} list={scene[name]} geometry={g} material={mat} />)}
      <lineSegments geometry={cordGeo} material={mats.line} />
      {scene.slabs.map(({ p, key }) => (
        <group key={key} position={[p.x, p.y, p.z]}>
          <mesh geometry={geo.slab} material={mats.slab} />
          <lineSegments geometry={geo.slabEdges} material={mats.line} />
        </group>
      ))}
    </group>
  );
});

function Instances({ list, geometry, material }) {
  const ref = useRef();
  useInstances(ref, list);
  return <instancedMesh ref={ref} args={[geometry, material, list.length]} frustumCulled={false} />;
}

/** Egy óra hajtja a kamerát ÉS a kivett kötetet, ugyanabból a pózból, ugyanabban a képkockában. */
function Rig({ plan, freezeAt, onTick, onDone }) {
  const { camera } = useThree();
  const start = useRef(null);
  const done = useRef(false);
  const bookRef = useRef();
  const mat = useMemo(() => makeHatchMaterial({ ink: RUBRIC, spacing: 0.009, base: 0.2 }), []);
  const geo = useMemo(() => new THREE.BoxGeometry(BOOK.w, BOOK.h, BOOK.d), []);
  useEffect(() => () => { mat.dispose(); geo.dispose(); }, [mat, geo]);

  const apply = useCallback((t) => {
    const pose = poseAt(plan, Math.min(t, WALK_DURATION_S));
    camera.position.copy(pose.pos);
    camera.lookAt(pose.look);
    if (bookRef.current) {
      bookRef.current.position.copy(plan.book).add(plan.frame.out.clone().multiplyScalar(-pose.slide));
      bookRef.current.position.y += pose.lift;
    }
  }, [camera, plan]);

  useLayoutEffect(() => { apply(freezeAt ?? 0); }, [apply, freezeAt]);

  useFrame(() => {
    let t = freezeAt;
    if (t == null) {
      // Faliórából: lassú gépen képkockát ejt, de a séta hossza nem nyúlik.
      const now = performance.now();
      if (start.current == null) start.current = now;
      t = (now - start.current) / 1000;
    }
    apply(t);
    onTick(t);
    if (freezeAt == null && !done.current && t >= WALK_DURATION_S) {
      done.current = true;
      onDone();
    }
  });

  return <mesh ref={bookRef} geometry={geo} material={mat} rotation={[0, plan.frame.theta, 0]} />;
}

class SceneBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onFail(); }
  render() { return this.state.failed ? null : this.props.children; }
}

const INTERACTIVE = 'input, button, select, textarea, a[href], [contenteditable="true"]';

export default function EngravedWalk({ hierarchy, layout = getLayout(), onComplete, onSkip, alwaysSkip = false, onAlwaysSkipChange, freezeAt = null }) {
  const t = useT();
  const plan = useMemo(() => ({ ...buildPlan(hierarchy, layout), hierarchy }), [hierarchy, layout]);
  const tier = useMemo(qualityTier, []);
  // A téma a <html> aktuális állapotából: sötétben karcrajz, világosban rézkarc.
  useMemo(() => {
    const root = document.documentElement;
    const dark = root.dataset.theme === 'dark'
      || (!root.dataset.theme && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
    setTheme(Boolean(dark));
  }, []);
  const [canAnimate] = useState(() =>
    !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches && hasWebGL());
  const [step, setStep] = useState(() => stepAt(plan, freezeAt ?? 0));
  const rootRef = useRef(null);
  const barRef = useRef(null);
  const fadeRef = useRef(null);
  const skipRef = useRef(null);

  // Egyetlen lezárás: természetes vég, Skip, reduced motion vagy renderhiba — csak az első számít.
  const callbacks = useRef({ onComplete, onSkip });
  callbacks.current = { onComplete, onSkip };
  const finished = useRef(false);
  const finish = useCallback((kind) => {
    if (finished.current) return;
    finished.current = true;
    const { onComplete: complete, onSkip: skipCb } = callbacks.current;
    (kind === 'skip' ? (skipCb ?? complete) : complete)();
  }, []);
  const skip = useCallback(() => finish('skip'), [finish]);
  const complete = useCallback(() => finish('complete'), [finish]);

  useEffect(() => {
    if (!canAnimate) complete();
  }, [canAnimate, complete]);

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const onChange = (e) => { if (e.matches) skip(); };
    mq?.addEventListener?.('change', onChange);
    return () => mq?.removeEventListener?.('change', onChange);
  }, [skip]);

  useEffect(() => {
    skipRef.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        skip();
      } else if (e.key === ' ' && !e.target.closest?.(INTERACTIVE)) {
        e.preventDefault();
        skip();
      } else if (e.key === 'Tab' && rootRef.current) {
        // Fókuszcsapda: a dialógusból Tabbal nem lehet kilépni.
        const items = [...rootRef.current.querySelectorAll(INTERACTIVE)];
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && (document.activeElement === first || !rootRef.current.contains(document.activeElement))) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [skip]);

  const onTick = useCallback((t) => {
    const next = stepAt(plan, t);
    setStep((prev) => (prev === next ? prev : next));
    if (barRef.current) barRef.current.style.transform = `scaleX(${Math.min(t / WALK_DURATION_S, 1)})`;
    if (fadeRef.current) fadeRef.current.style.opacity = String(smooth(MOVE_S + 1.4, MOVE_S + 2.0, t));
  }, [plan]);

  if (!canAnimate) return null;

  const hexId = hierarchy.hex || '0';
  const hexShort = hexId.length > 8 ? `${hexId.slice(0, 8)}…` : hexId;
  let caption;
  if (step < 0) caption = <>{t('walk.towards')} <span className="walk-hex">{hexShort}</span></>;
  else if (step === 0) caption = <>{t('walk.hexagon')} <span className="walk-hex">{hexShort}</span></>;
  else caption = t('walk.place', hierarchy, step);

  return (
    <div className="walk" role="dialog" aria-modal="true" aria-label={t('walk.aria')} ref={rootRef}>
      <SceneBoundary onFail={complete}>
        <Canvas
          className="walk-canvas"
          dpr={tier.dpr}
          camera={{ fov: 55, near: 0.05, far: 80 }}
          gl={{ antialias: true, preserveDrawingBuffer: freezeAt != null }}
          onCreated={({ gl }) => {
            gl.setClearColor(PAPER);
            gl.domElement.addEventListener('webglcontextlost', complete, { once: true });
          }}
        >
          <Floors plan={plan} floors={tier.floors} />
          <Rig plan={plan} freezeAt={freezeAt} onTick={onTick} onDone={complete} />
        </Canvas>
      </SceneBoundary>

      <div className="walk-fade" ref={fadeRef} aria-hidden="true" />

      <div className="walk-bar">
        <div className="walk-progress" aria-hidden="true"><span ref={barRef} /></div>
        <div className="walk-row">
          <p className="walk-caption" aria-live="polite">{caption}</p>
          <div className="walk-actions">
            {onAlwaysSkipChange && (
              <label className="walk-check">
                <input type="checkbox" checked={alwaysSkip} onChange={(e) => onAlwaysSkipChange(e.target.checked)} />
                {t('walk.dontWalk')}
              </label>
            )}
            <button type="button" ref={skipRef} className="walk-skip" onClick={skip}>
              {t('walk.skip')} <span>(Esc)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Ellenőrzéshez: a séta lépésenkénti pózai számszerűen kiolvashatók (pl. szemmagasság, dőlésszög).
export { buildPlan, poseAt };
