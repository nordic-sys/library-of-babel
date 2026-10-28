// share.js
// Megosztható lapkép: egy lap PNG-kártyán, a böngészőben rajzolva (Canvas 2D, szerver nélkül).
// Mindig papír: a kép a lapot mutatja, nem a képernyő témáját. 1080 × 1350 (4:5, a közösségi
// oldalak álló formátuma), kétszeres felbontásban. A betűk a sajátjaink (fontsource), a rajzolás
// előtt megvárjuk, hogy betöltődjenek.
import { LINES, LINE_LENGTH, lineSegments } from './location.js';

const W = 1080;
const H = 1350;
const SCALE = 2;
const C = {
  paper: '#EEE6D3',
  leaf: '#F3ECDD',
  ink: '#1D1A16',
  ink2: '#4F483D',
  ink3: '#6B6255',
  rule: '#C9BD9F',
  rubric: '#8F2A19',
};
const SERIF = '"EB Garamond", Georgia, serif';
const MONO = '"IBM Plex Mono", ui-monospace, Menlo, monospace';

async function fontsReady() {
  if (!document.fonts?.load) return;
  await Promise.all([
    document.fonts.load(`16px ${MONO}`),
    document.fonts.load(`20px ${SERIF}`),
    document.fonts.load(`italic 40px ${SERIF}`),
  ]).catch(() => {});
}

/*
 * Szöveg tördelése adott szélességre, szóhatáron; a sornál hosszabb szót (pl. „bárhol” módban egy
 * szóköz nélküli sort) jelenként töri. Legfeljebb `max` sor, a vágást kihagyásjel jelzi.
 */
function wrap(ctx, text, width, max) {
  const lines = [];
  let line = '';
  const push = (l) => { lines.push(l); };
  for (const word of text.split(' ')) {
    let rest = word;
    while (ctx.measureText(rest).width > width) {
      let n = rest.length;
      while (n > 1 && ctx.measureText(rest.slice(0, n)).width > width) n--;
      if (line) { push(line); line = ''; }
      push(rest.slice(0, n));
      rest = rest.slice(n);
    }
    const next = line ? `${line} ${rest}` : rest;
    if (ctx.measureText(next).width > width && line) {
      push(line);
      line = rest;
    } else {
      line = next;
    }
  }
  if (line) push(line);
  if (lines.length <= max) return lines;
  const cut = lines.slice(0, max);
  let last = cut[max - 1];
  while (last && ctx.measureText(`${last}…`).width > width) last = last.slice(0, -1);
  cut[max - 1] = `${last.trimEnd()}…`;
  return cut;
}

/**
 * A kártya: fejléc, a talált sor (ha ezen a lapon van), a hely, a lap 40 sora a kiemeléssel és a
 * margójellel, alul a sor helye és a cím eleje-vége.
 * `words`: a felület szavai (a hívó fordítja): { title, place, line, foot }.
 */
export async function renderPageCard({ text, hit, hexText, words }) {
  await fontsReady();
  const canvas = document.createElement('canvas');
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  const ctx = canvas.getContext('2d');
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = C.paper;
  ctx.fillRect(0, 0, W, H);

  const M = 72;
  let y = 92;
  // Fejléc: a könyvtár neve, ritkítva.
  ctx.fillStyle = C.ink2;
  ctx.font = `16px ${SERIF}`;
  ctx.letterSpacing = '3px';
  ctx.fillText(words.title.toUpperCase(), M, y);
  ctx.letterSpacing = '0px';
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(M, y + 18);
  ctx.lineTo(W - M, y + 18);
  ctx.stroke();
  y += 74;

  // A talált sor, dőlten, idézőjelben — ha ezen a lapon áll.
  if (words.line) {
    ctx.fillStyle = C.ink;
    ctx.font = `italic 40px ${SERIF}`;
    for (const l of wrap(ctx, words.line, W - 2 * M, 2)) {
      ctx.fillText(l, M, y);
      y += 48;
    }
    y += 4;
  }
  // A hely: a hatszög monóval, a többi a szöveg betűjével.
  ctx.font = `18px ${MONO}`;
  ctx.fillStyle = C.ink2;
  ctx.fillText(hexText, M, y);
  const hexW = ctx.measureText(hexText).width;
  ctx.font = `21px ${SERIF}`;
  ctx.fillText(` · ${words.place}`, M + hexW, y);
  y += 30;

  // A lap: 40 sor × 80 jel, fix szélességű betűvel. A sortáv annyi, hogy a lábléc is elférjen.
  const fs = 16;
  const footY = H - 46;
  const lh = Math.min(23.4, (footY - 40 - y - 60) / LINES);
  ctx.font = `${fs}px ${MONO}`;
  const cw = ctx.measureText('M').width;
  const padX = (W - 2 * M - LINE_LENGTH * cw) / 2;
  const padY = 30;
  const leafH = LINES * lh + 2 * padY;
  ctx.fillStyle = C.leaf;
  ctx.fillRect(M, y, W - 2 * M, leafH);
  ctx.strokeStyle = C.rule;
  ctx.strokeRect(M + 0.5, y + 0.5, W - 2 * M - 1, leafH - 1);
  const x0 = M + padX;
  for (let i = 0; i < LINES; i++) {
    const base = y + padY + (i + 0.78) * lh;
    let x = x0;
    let marked = false;
    for (const seg of lineSegments(text, i, hit?.start ?? -1, hit?.length ?? 0)) {
      ctx.fillStyle = C.ink;
      ctx.fillText(seg.text, x, base);
      const w = seg.text.length * cw;
      if (seg.mark) {
        marked = true;
        ctx.fillStyle = C.rubric;
        ctx.fillRect(x, base + 4, w, 1.6);
      }
      x += w;
    }
    // Margójel a találat sorai mellett.
    if (marked) {
      ctx.fillStyle = C.rubric;
      ctx.fillRect(x0 - 16, base - fs * 0.62, 2, fs * 0.8);
    }
  }
  y = footY;

  // Lábléc: a sor helye (bal) és a cím eleje-vége (jobb), mindig a kártya aljához igazítva.
  ctx.font = `18px ${SERIF}`;
  ctx.fillStyle = C.ink3;
  ctx.fillText(words.foot[0], M, y);
  ctx.textAlign = 'right';
  ctx.fillText(words.foot[1], W - M, y);
  ctx.textAlign = 'left';

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('toBlob'))), 'image/png');
  });
}

/**
 * Megosztás: ahol a rendszer engedi (főleg telefonon), a megosztás-menü; máshol letöltés.
 * Vissza: 'shared' | 'saved' | 'cancelled'.
 */
export async function shareOrSave(blob, filename, title) {
  const file = typeof File === 'function' ? new File([blob], filename, { type: 'image/png' }) : null;
  if (file && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return 'shared';
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancelled';
      // A megosztás nem sikerült: marad a letöltés.
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return 'saved';
}
