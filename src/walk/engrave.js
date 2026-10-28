import * as THREE from 'three';
import { FLOOR_H, LAMP_Y, LAMP_Z } from '../geometry.js';

/**
 * Rézkarc-anyagok a sétához.
 *
 * A sraffozás VILÁGkoordinátából számol (nem képernyőből), így mozgás közben a vonalak a
 * tárgyon maradnak, nem úsznak. A fényt a hatszög két lámpája adja, emeletenként
 * ismétlődve; a köd főleg függőleges, hogy a fenti és lenti emeletek a papírba vesszenek,
 * a saját emelet pedig tiszta maradjon.
 */

export const PAPER = new THREE.Color('#E9E0CB');
export const INK = new THREE.Color('#1D1A16');
export const RUBRIC = new THREE.Color('#8F2A19');
export { FLOOR_H };

/** Lámpák egy emeleten belül (Borges: kettő, keresztben). */
const LAMP_A = new THREE.Vector3(0, LAMP_Y, LAMP_Z);
const LAMP_B = new THREE.Vector3(0, LAMP_Y, -LAMP_Z);

const shared = {
  uPaper: { value: PAPER },
  uLatticeG: { value: new THREE.Vector2(1, 0) },
  uLatticeH: { value: new THREE.Vector2(0.5, Math.sqrt(3) / 2) },
  uLatticeD: { value: 1e6 },
  uFloorH: { value: FLOOR_H },
  uLampA: { value: LAMP_A },
  uLampB: { value: LAMP_B },
  uFogY: { value: 0.12 },
  uFogH: { value: 0.035 },
  uInvert: { value: 0 },
};

/*
 * Lámpafény (sötét mód): karcrajz — sötét alap, a vonalak a FÉNYT rajzolják. A tónus ugyanaz,
 * csak a vonalsűrűség a világosságot követi, nem a sötétséget; a köd így a sötétbe vész, ami
 * Borges „elégtelen, szakadatlan” fényéhez illik. A színek közös objektumok: az anyagok
 * ugyanazt a THREE.Color-t látják, ezért elég itt átállítani őket, a séta indulása előtt.
 */
const LIGHT = { paper: '#E9E0CB', ink: '#1D1A16', rubric: '#8F2A19' };
const DARK = { paper: '#14110D', ink: '#E3D8C0', rubric: '#D0664E' };

export function setTheme(dark) {
  const c = dark ? DARK : LIGHT;
  PAPER.set(c.paper);
  INK.set(c.ink);
  RUBRIC.set(c.rubric);
  shared.uInvert.value = dark ? 1 : 0;
  // A távol a sötétbe vész: kétszer sűrűbb vízszintes köd, mint papíron.
  shared.uFogH.value = dark ? 0.075 : 0.035;
}

/**
 * A hatszögrács: g a galéria iránya, h a 60°-kal elforgatott ajtóirány, step a középpontok
 * távolsága. (60°-os bázis: a `distance.js` 120°-os (q, r)-jától független, a kettő nem keveredik.) Az árnyaló ebből keresi meg minden pont legközelebbi hatszögét (annak két lámpája
 * világít) — a szomszéd galériák hatszögeiben is.
 */
export function setLattice(g, h, step) {
  shared.uLatticeG.value.set(g.x, g.z);
  shared.uLatticeH.value.set(h.x, h.z);
  shared.uLatticeD.value = step;
}

const fogChunk = /* glsl */ `
  float fogAmount(vec3 p) {
    vec3 d = p - cameraPosition;
    float fy = d.y * uFogY;
    float fh = length(d.xz) * uFogH;
    return 1.0 - exp(-(fy * fy + fh * fh));
  }
`;

const hatchVertex = /* glsl */ `
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  varying vec2 vUv;
  #ifdef USE_TONE
    attribute float aTone;
    varying float vTone;
  #endif
  void main() {
    mat4 m = modelMatrix;
    #ifdef USE_INSTANCING
      m = modelMatrix * instanceMatrix;
    #endif
    #ifdef USE_TONE
      vTone = aTone;
    #endif
    vec4 wp = m * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    vWorldNormal = normalize(mat3(m) * normal);
    vUv = uv;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const hatchFragment = /* glsl */ `
  uniform vec3 uPaper;
  uniform vec3 uInk;
  uniform float uFloorH;
  uniform vec3 uLampA;
  uniform vec3 uLampB;
  uniform vec2 uLatticeG;
  uniform vec2 uLatticeH;
  uniform float uLatticeD;
  uniform float uFogY;
  uniform float uFogH;
  uniform float uOutline;
  uniform float uSilhouette;
  uniform float uBase;
  uniform float uSpacing;
  uniform float uInvert;
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  varying vec2 vUv;
  #ifdef USE_TONE
    varying float vTone;
  #endif
  ${fogChunk}

  float lampLight(vec3 lamp, vec3 p, vec3 n) {
    vec3 l = lamp - p;
    float d = length(l);
    float lambert = max(dot(n, l / d), 0.0) * 0.75 + 0.25;
    return 1.0 * lambert / (1.0 + 0.08 * d * d);
  }

  // Egy vonalsereg: x a vonalakra merőleges koordináta (vonal-egységben), w a vonal
  // félszélessége 0..0.5 (0 = nincs vonal). Képpont-állandó élsimítás fwidth-del.
  float lines(float x, float w) {
    float f = abs(fract(x) - 0.5);
    float aa = fwidth(x) * 0.75;
    return (1.0 - smoothstep(w - aa, w + aa, f)) * step(0.001, w);
  }

  float hatch(vec2 c, float dark) {
    float ink = lines(c.x + c.y, clamp(dark * 0.5 - 0.07, 0.0, 0.3));
    ink = max(ink, lines(c.x - c.y, clamp(dark * 0.5 - 0.24, 0.0, 0.3)));
    ink = max(ink, lines(c.y * 1.4, clamp(dark * 0.45 - 0.3, 0.0, 0.3)));
    return ink;
  }

  // A hatch() várható tintafedése (vonalseregenként 2w) — a tónus-tartalék ugyanezt adja,
  // így a sraffozásról tónusra váltás nem világosít.
  float hatchCoverage(float dark) {
    float a = 2.0 * clamp(dark * 0.5 - 0.07, 0.0, 0.3);
    float b = 2.0 * clamp(dark * 0.5 - 0.24, 0.0, 0.3);
    float c = 2.0 * clamp(dark * 0.45 - 0.3, 0.0, 0.3);
    return 1.0 - (1.0 - a) * (1.0 - b) * (1.0 - c);
  }

  void main() {
    vec3 n = normalize(vWorldNormal);
    vec3 p = vWorldPos;

    // A normál irányába kicsit beljebb lépve: a mennyezet alja az alatta lévő emelet lámpáit kapja.
    float floorBase = floor((p.y + n.y * 0.2) / uFloorH) * uFloorH;
    // A legközelebbi hatszög középpontja a rácson (axiális koordináták, kockás kerekítés):
    // annak a két lámpája világít.
    float latDet = uLatticeG.x * uLatticeH.y - uLatticeG.y * uLatticeH.x;
    float aq = (p.x * uLatticeH.y - p.z * uLatticeH.x) / (latDet * uLatticeD);
    float ar = (uLatticeG.x * p.z - uLatticeG.y * p.x) / (latDet * uLatticeD);
    vec3 cube = vec3(aq, -aq - ar, ar);
    vec3 rc = floor(cube + 0.5);
    vec3 diff = abs(rc - cube);
    if (diff.x > diff.y && diff.x > diff.z) rc.x = -rc.y - rc.z;
    else if (diff.y > diff.z) rc.y = -rc.x - rc.z;
    else rc.z = -rc.x - rc.y;
    vec2 hc = (uLatticeG * rc.x + uLatticeH * rc.z) * uLatticeD;
    vec3 base = vec3(hc.x, floorBase, hc.y);
    vec3 la = uLampA + base;
    vec3 lb = uLampB + base;
    float light = uBase + lampLight(la, p, n) + lampLight(lb, p, n);
    #ifdef USE_TONE
      light *= vTone;
    #endif
    float tone = clamp(light, 0.0, 1.0);

    // Felületi koordináták (világegységben): vízszintes lapon xz, függőlegesen (érintő, y).
    vec2 c;
    if (abs(n.y) > 0.6) {
      c = p.xz;
    } else {
      vec3 t = normalize(cross(vec3(0.0, 1.0, 0.0), n));
      c = vec2(dot(p, t), p.y);
    }

    // A képpont-lábnyom a felületen: a deriváltak Jacobi-mátrixának szinguláris értékei.
    vec2 jx = dFdx(c);
    vec2 jy = dFdy(c);
    float a2 = dot(jx, jx) + dot(jy, jy);
    float det = abs(jx.x * jy.y - jx.y * jy.x);
    float disc = sqrt(max(a2 * a2 - 4.0 * det * det, 0.0));
    float sMax = sqrt(0.5 * (a2 + disc));
    float sMin = sqrt(max(0.5 * (a2 - disc), 1e-12));

    // Oktávváltás: a vonalak a tárgyhoz kötöttek, de a sűrűségük a képernyőn ~állandó
    // (közelítve a sereg megfeleződik, távolodva megduplázódik, átúsztatva).
    float worldPerPx = max(sqrt(sMax * sMin), 1e-5);
    float lv = log2(worldPerPx * 7.0 / uSpacing);
    float l0 = floor(lv);
    float blend = fract(lv);
    // Lámpafényben csak a lámpák közelében gyűlik fény; a többi a sötétbe vész.
    float dark = mix(1.0 - tone, 0.92 * smoothstep(0.3, 1.1, tone), uInvert);
    float ink = mix(hatch(c / (uSpacing * exp2(l0)), dark), hatch(c / (uSpacing * exp2(l0 + 1.0)), dark), blend);

    // Súroló szögben a lábnyom elnyúlik: ott a vonalak moarét adnának, ezért azonos
    // fedésű sík tónusra váltunk (ahogy a metsző is tónussal oldaná meg).
    ink = mix(ink, hatchCoverage(dark), smoothstep(2.5, 6.0, sMax / sMin));

    // Körvonal a dobozlapok UV-széléből (képpont-állandó vastagság).
    if (uOutline > 0.5) {
      vec2 e = min(vUv, 1.0 - vUv);
      vec2 fw = fwidth(vUv);
      float edge = min(e.x / max(fw.x, 1e-4), e.y / max(fw.y, 1e-4));
      ink = max(ink, 1.0 - smoothstep(0.6, 1.4, edge));
    }
    // Sziluett gömbökhöz (lámpa).
    if (uSilhouette > 0.5) {
      vec3 v = normalize(cameraPosition - p);
      float rim = abs(dot(n, v));
      ink = max(ink, 1.0 - smoothstep(0.18, 0.3, rim));
    }

    vec3 col = mix(uPaper, uInk, ink);
    col = mix(col, uPaper, fogAmount(p));
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

export function makeHatchMaterial({
  ink = INK,
  outline = true,
  silhouette = false,
  base = 0.1,
  spacing = 0.012,
  side = THREE.FrontSide,
  tone = false,
} = {}) {
  return new THREE.ShaderMaterial({
    defines: tone ? { USE_TONE: '' } : {},
    uniforms: {
      ...shared,
      uInk: { value: ink },
      uOutline: { value: outline ? 1 : 0 },
      uSilhouette: { value: silhouette ? 1 : 0 },
      uBase: { value: base },
      uSpacing: { value: spacing },
    },
    vertexShader: hatchVertex,
    fragmentShader: hatchFragment,
    side,
  });
}

const lineVertex = /* glsl */ `
  varying vec3 vWorldPos;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const lineFragment = /* glsl */ `
  uniform vec3 uPaper;
  uniform vec3 uInk;
  uniform float uFogY;
  uniform float uFogH;
  varying vec3 vWorldPos;
  ${fogChunk}
  void main() {
    gl_FragColor = vec4(mix(uInk, uPaper, fogAmount(vWorldPos)), 1.0);
    #include <colorspace_fragment>
  }
`;

/** Tusvonal (élek), ugyanazzal a köddel, mint a sraffozás. */
export function makeLineMaterial(ink = INK) {
  return new THREE.ShaderMaterial({
    uniforms: { ...shared, uInk: { value: ink } },
    vertexShader: lineVertex,
    fragmentShader: lineFragment,
  });
}
