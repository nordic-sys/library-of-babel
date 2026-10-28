import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  LINES, LINE_LENGTH, calculateHierarchy, edgeNote, hexLabel, lineSegments, matchLocation,
  bookWord, matchPhrase, pageOf, pagesPhrase, placeText, runningHead, shownPages, spreadOf, turnLabel, turnTarget,
} from './location.js';
import { useLang, useT } from './i18n.js';
import { distanceParagraphs } from './distance.js';
import FarSketch from './FarSketch.jsx';
import { renderPageCard, shareOrSave } from './share.js';
import { useLayout } from './layout.js';

/**
 * A nyitott könyv („1941-es kiadás”).
 *
 * A lap 40 sor × 80 jel, fix szélességű betűvel — csak így igaz a „line 3, from character 41”.
 * Széles képernyőn valódi oldalpár (bal páros, jobb páratlan), a lapozás ±2; keskenyebb
 * asztali nézetben egy lap, ±1; telefonon bélyegkép + nagyító + „Read it all”. A méretet a
 * betűméret adja, nem `transform: scale()`, mert a skálázott réteg elmossa a kis szöveget.
 * Kinyitva a könyv lapos; 3D csak a kinyitáskor és a lapozáskor van.
 */

const FOCUSABLE = 'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
const TURN_MS = 620;
const OPEN_MS = 900;

/* A lap méretei a betűméretből (IBM Plex Mono: 0,6 em/jel). */
const pageWidth = (fs) => 84 + 48 * fs;
const lineHeight = (fs) => Math.round(fs * 1.25 * 10) / 10;

function measure() {
  if (typeof window === 'undefined') return { mode: 'two', fs: 12, linesH: 600 };
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const fsTwo = (vw - 96 - 24 - 2 * 84) / 96;
  const fsOne = (vw - 64 - 24 - 84) / 48;
  let mode = 'phone';
  let fs = Math.min(6, (Math.min(vw - 128, 320) - 30) / 48);
  if (fsTwo >= 10) {
    mode = 'two';
    fs = Math.min(12, fsTwo);
  } else if (fsOne >= 9.5 && vh >= 480) {
    mode = 'one';
    fs = Math.min(13, fsOne);
  }
  fs = Math.floor(fs * 10) / 10;
  // Ami függőlegesen nem fér el, az a lapon belül görget (a találat oda gördül), nem zsugorodik.
  const chrome = 8 + 44 + 12 + 22 + 12 + 52 + 10 + 96;
  const linesH = Math.min(LINES * lineHeight(fs), Math.max(vh - chrome, 12 * lineHeight(fs)));
  return { mode, fs, linesH };
}

function useBookLayout() {
  const [layout, setLayout] = useState(measure);
  useEffect(() => {
    const onResize = () => setLayout(measure());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return layout;
}

/** A találat ezen a lapon: { start, length } vagy null. */
function hitOn(addr, hit) {
  if (!hit || addr === null || hit.address !== addr.toString()) return null;
  return hit.start >= 0 ? hit : null;
}

function Line({ text, index, hit }) {
  const segments = lineSegments(text, index, hit?.start ?? -1, hit?.length ?? 0);
  const marked = segments.some((s) => s.mark);
  return (
    <div className="line">
      <span className="line-margin" aria-hidden="true">{marked && <span className="line-tick" />}</span>
      <span className="line-text">
        {segments.map((s, i) => (s.mark ? <mark key={i}>{s.text}</mark> : <span key={i}>{s.text}</span>))}
      </span>
    </div>
  );
}

function Leaf({ addr, side, text, hit, kept, linesRef, linesH, fullHead = false }) {
  const t = useT();
  const lang = useLang();
  if (addr === null) {
    return <section className={`leaf leaf--${side} leaf--blank`} aria-label={t('book.endpaper')} />;
  }
  const h = calculateHierarchy(addr);
  const head = fullHead ? placeText(h, { page: false, lang }) : runningHead(h, side, lang);
  const here = hitOn(addr, hit);
  return (
    <section className={`leaf leaf--${side}`} aria-label={t('book.page', h.page)}>
      {kept && <span className="ribbon" aria-hidden="true" />}
      <p className="running-head">{head}</p>
      <div className="lines" ref={linesRef} style={linesH ? { height: linesH } : undefined}>
        {Array.from({ length: LINES }, (_, i) => (
          <Line key={i} text={text} index={i} hit={here} />
        ))}
      </div>
      <p className="folio">{h.page}</p>
    </section>
  );
}

/** A nagyító tartalma: a fókusz-sor körüli három sor, 40 jelnyi ablakban. */
function glassRows(text, focus, hit) {
  const first = Math.min(Math.max(focus.line - 1, 0), LINES - 3);
  const c0 = Math.min(Math.max(Math.round(focus.col) - 20, 0), LINE_LENGTH - 40);
  const rows = [];
  for (let l = first; l < first + 3; l++) {
    const base = l * LINE_LENGTH;
    const parts = [];
    for (let c = c0; c < c0 + 40; c++) {
      const i = base + c;
      const mark = Boolean(hit) && i >= hit.start && i < hit.start + hit.length;
      const last = parts[parts.length - 1];
      if (last && last.mark === mark) last.text += text[i];
      else parts.push({ text: text[i], mark });
    }
    rows.push(parts);
  }
  return { rows, first, c0 };
}

/** Telefon: bélyegkép, koppintásra oda ugró nagyító. */
function PhonePage({ addr, text, hit, kept, fs }) {
  const t = useT();
  const lang = useLang();
  const h = calculateHierarchy(addr);
  const here = hitOn(addr, hit);
  const [focus, setFocus] = useState(() => {
    if (!here) return { line: 1, col: 20 };
    const m = matchLocation(here.start, here.length);
    return { line: m.line - 1, col: m.col - 1 + Math.floor(Math.min(here.length, 40) / 2) };
  });
  const { rows, first, c0 } = glassRows(text, focus, here);
  const lh = lineHeight(fs);

  const onPick = (event) => {
    const box = event.currentTarget.getBoundingClientRect();
    const line = Math.floor((event.clientY - box.top) / lh);
    const col = Math.floor((event.clientX - box.left) / (box.width / LINE_LENGTH));
    setFocus({ line: Math.min(Math.max(line, 0), LINES - 1), col: Math.min(Math.max(col, 0), LINE_LENGTH - 1) });
  };

  return (
    <div className="phone-page">
      <section className="leaf leaf--thumb" aria-label={t('book.page', h.page)} style={{ '--fs': `${fs}px`, '--lh': `${lh}px` }}>
        {kept && <span className="ribbon" aria-hidden="true" />}
        <p className="running-head">{bookWord(h.vol, lang)}</p>
        {/* Koppintásra a nagyító oda ugrik; a teljes szöveg a „Read it all” alatt érhető el. */}
        <div className="lines" aria-hidden="true" onClick={onPick}>
          <span
            className="glass-frame"
            style={{ top: first * lh, height: 3 * lh, left: `${(c0 / LINE_LENGTH) * 100}%`, width: '50%' }}
          />
          {Array.from({ length: LINES }, (_, i) => (
            <Line key={i} text={text} index={i} hit={here} />
          ))}
        </div>
        <p className="folio">{h.page}</p>
      </section>
      <div className="glass" aria-hidden="true">
        <p className="glass-label">
          {t('book.glass', first + 1, first + 3, c0 + 1, c0 + 40)}
        </p>
        <div className="glass-rows">
          {rows.map((parts, r) => (
            <div key={r}>
              {parts.map((p, i) => (p.mark ? <mark key={i}>{p.text}</mark> : <span key={i}>{p.text}</span>))}
            </div>
          ))}
        </div>
        <p className="glass-hint">{t('book.glassHint')}</p>
      </div>
    </div>
  );
}

/** Nagy olvasónézet: a látható lap(ok) mind a 40 sora, sorszámmal, egy ujjal görgethetően. */
function Reader({ pages, pageText, hit, onClose }) {
  const t = useT();
  const lang = useLang();
  const ref = useRef(null);
  const closeRef = useRef(null);
  /* A találat mindkét irányban a látótérbe kerül: telefonon a 80 jeles sor vízszintesen görget. */
  useLayoutEffect(() => {
    closeRef.current?.focus();
    const body = ref.current;
    const mark = body?.querySelector('mark');
    if (!mark) return;
    const b = body.getBoundingClientRect();
    const m = mark.getBoundingClientRect();
    body.scrollTop = Math.max(0, body.scrollTop + m.top - b.top - body.clientHeight / 2);
    body.scrollLeft = Math.max(0, body.scrollLeft + m.left - b.left - Math.max(16, (body.clientWidth - m.width) / 2));
  }, []);
  const first = calculateHierarchy(pages[0]);
  return (
    <div className="reader" role="region" aria-label={t('book.readerAria')}>
      <div className="reader-bar">
        <p>
          {bookWord(first.vol, lang)} · {pagesPhrase(pages[0], pages.length === 2, lang)}
        </p>
        <button type="button" className="link" ref={closeRef} onClick={onClose}>{t('book.readerBack')}</button>
      </div>
      <div className="reader-body" ref={ref}>
        {pages.map((addr) => {
          const text = pageText(addr);
          const here = hitOn(addr, hit);
          return (
            <section key={addr.toString()} className="reader-page" aria-label={t('book.page', pageOf(addr))}>
              <h2>{t('book.page', pageOf(addr))}</h2>
              <ol className="reader-lines">
                {Array.from({ length: LINES }, (_, i) => (
                  <li key={i}>
                    {lineSegments(text, i, here?.start ?? -1, here?.length ?? 0).map((s, j) =>
                      s.mark ? <mark key={j}>{s.text}</mark> : <span key={j}>{s.text}</span>)}
                  </li>
                ))}
              </ol>
            </section>
          );
        })}
      </div>
    </div>
  );
}

/* Egy nagy szám: kiírva, vagy mantissza × 10 a kitevőn. */
function BigNum({ n }) {
  if (n.plain) return n.plain;
  return (
    <span className="far-num">
      {n.m}{'\u2009×\u2009'}10<sup>{n.e}</sup>
    </span>
  );
}

/* „How far is it?”: a hatszög távolsága emberi léptékben (`distance.js`). */
function Distance({ addr, onClose }) {
  const t = useT();
  const lang = useLang();
  const closeRef = useRef(null);
  useLayoutEffect(() => {
    closeRef.current?.focus();
  }, []);
  const h = calculateHierarchy(addr);
  return (
    <div className="reader" role="region" aria-label={t('book.howFar')}>
      <div className="reader-bar">
        <p>
          <span className="mono">{hexLabel(h)}</span> · {placeText(h, { lang })}
        </p>
        <button type="button" className="link" ref={closeRef} onClick={onClose}>{t('book.readerBack')}</button>
      </div>
      <div className="reader-body far">
        <h2>{t('book.howFar')}</h2>
        <div className="far-layout">
          <div className="far-text">
            {distanceParagraphs(addr, lang).map((parts, i) => (
              <p key={i}>
                {parts.map((x, j) => (typeof x === 'string' ? x : <BigNum key={j} n={x} />))}
              </p>
            ))}
          </div>
          <FarSketch addr={addr} />
        </div>
      </div>
    </div>
  );
}

/*
 * Nyomtatási folió: a látható lap(ok) egy-egy A4-es oldalon — futófej, a 40 sor a kiemeléssel,
 * és alul a lap teljes címe, hogy papírról is vissza lehessen találni. Képernyőn rejtett.
 */
function PrintFolio({ pages, pageText, hit }) {
  const t = useT();
  const lang = useLang();
  const layout = useLayout();
  return (
    <div className="print-folio" aria-hidden="true">
      {pages.map((a) => {
        const h = calculateHierarchy(a);
        const here = hitOn(a, hit);
        const text = pageText(a);
        const full = a.toString();
        return (
          <section className="folio" key={full}>
            <p className="folio-title">{t('title')}</p>
            <p className="folio-place"><span className="mono">{hexLabel(h)}</span> · {placeText(h, { lang })} · {t(`layout.on.${layout}`)}</p>
            {here && <p className="folio-line">{t('book.cardLine', clip(text.slice(here.start, here.start + here.length)))}</p>}
            <div className="folio-lines">
              {Array.from({ length: LINES }, (_, i) => (
                <div key={i}>
                  {lineSegments(text, i, here?.start ?? -1, here?.length ?? 0).map((seg, j) =>
                    (seg.mark ? <mark key={j}>{seg.text}</mark> : <span key={j}>{seg.text}</span>))}
                </div>
              ))}
            </div>
            {here && <p className="folio-where">{matchPhrase(here.start, here.length, lang)}</p>}
            <p className="folio-address-label">{t('book.printAddress', full.length)}</p>
            <p className="folio-address">{full}</p>
          </section>
        );
      })}
    </div>
  );
}

/* Hosszú idézet a kártyán és a folión: legfeljebb 120 jel, kihagyásjellel. */
const clip = (s, max = 120) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

export default function Book({
  address,
  hit,
  pageText,
  isKept,
  notice = '',
  reducedMotion = false,
  onTurn,
  onGoToHit,
  onClose,
  onToggleKeep,
  onCopy,
  onStepResult = () => {},
  onNotify = () => {},
  toast = null,
}) {
  const t = useT();
  const lang = useLang();
  // Az elrendezés a hely-feliratokat számolja másképp (`layout.js`); a függőség így látszik is.
  const layout = useLayout();
  const { mode, fs, linesH } = useBookLayout();
  const twoPage = mode === 'two';
  const addr = useMemo(() => BigInt(address), [address]);
  const [turn, setTurn] = useState(null);
  const [opening, setOpening] = useState(() => !reducedMotion && twoPage);
  const [sheet, setSheet] = useState(null); // 'read' | 'far' | null
  const reading = sheet !== null;
  const dialogRef = useRef(null);
  const leftLinesRef = useRef(null);
  const rightLinesRef = useRef(null);
  const readButtonRef = useRef(null);
  const farButtonRef = useRef(null);
  const sheetRef = useRef(null);
  sheetRef.current = sheet;

  const closeReader = useCallback(() => {
    const opener = sheetRef.current === 'far' ? farButtonRef : readButtonRef;
    setSheet(null);
    requestAnimationFrame(() => opener.current?.focus());
  }, []);

  const pages = shownPages(addr, twoPage);
  const spread = twoPage ? spreadOf(addr) : { left: null, right: addr };
  const current = calculateHierarchy(addr);

  useEffect(() => {
    if (!opening) return undefined;
    const t = setTimeout(() => setOpening(false), OPEN_MS + 200);
    return () => clearTimeout(t);
  }, [opening]);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  /* Ha a lap függőlegesen görget, a találat sora kerüljön középre. */
  useLayoutEffect(() => {
    for (const ref of [leftLinesRef, rightLinesRef]) {
      const box = ref.current;
      const mark = box?.querySelector('mark');
      if (box) box.scrollTop = mark ? Math.max(0, mark.parentElement.parentElement.offsetTop - box.clientHeight / 2) : 0;
    }
  }, [address, hit, linesH, mode]);

  const turnTo = useCallback((dir) => {
    if (turn || opening) return;
    const target = turnTarget(addr, dir, twoPage);
    if (reducedMotion || !twoPage) {
      onTurn(target);
      return;
    }
    setTurn({ dir, target });
  }, [turn, opening, addr, twoPage, reducedMotion, onTurn]);

  const turnRef = useRef(null);
  turnRef.current = turn;
  const finishTurn = useCallback(() => {
    const t = turnRef.current;
    turnRef.current = null;
    setTurn(null);
    if (t) onTurn(t.target);
  }, [onTurn]);

  /* Biztonsági háló: ha az animationend elmarad (rejtett lap, háttérfül), a lapozás akkor is lezárul. */
  useEffect(() => {
    if (!turn) return undefined;
    const t = setTimeout(finishTurn, TURN_MS + 300);
    return () => clearTimeout(t);
  }, [turn, finishTurn]);

  const keepTarget = address;
  const kept = isKept(keepTarget);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.target.closest?.('input, textarea')) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        if (reading) closeReader();
        else onClose();
        return;
      }
      if (event.key === 'Tab' && dialogRef.current) {
        // Fókuszcsapda: olvasónézetben annak vezérlői (és az értesítő), különben a dialógusé.
        const scope = dialogRef.current;
        const items = Array.from(scope.querySelectorAll(FOCUSABLE))
          .filter((el) => el.offsetParent !== null && !el.closest('[inert]'));
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        const outside = !scope.contains(document.activeElement) || document.activeElement === scope;
        if (event.shiftKey && (document.activeElement === first || outside)) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && (document.activeElement === last || outside)) {
          event.preventDefault();
          first.focus();
        }
        return;
      }
      if (reading) return;
      if (event.shiftKey && (event.key === 'ArrowRight' || event.key === 'ArrowLeft')) {
        event.preventDefault();
        if (!turn) onStepResult(event.key === 'ArrowRight' ? 1 : -1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        turnTo(1);
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        turnTo(-1);
      } else if ((event.key === 's' || event.key === 'S') && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        onToggleKeep(keepTarget);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [reading, closeReader, onClose, turnTo, onToggleKeep, keepTarget, onStepResult, turn]);

  /* A fejléc mondata: hol a sor, vagy merre van; különben a kötet széle. */
  const hitShown = hit && pages.some((p) => p.toString() === hit.address) && hit.start >= 0;
  let status = null;
  if (hitShown) {
    status = t('book.yourLine', pageOf(BigInt(hit.address)), matchPhrase(hit.start, hit.length, lang));
  } else if (hit && hit.start >= 0) {
    status = (
      <>
        {t('book.lineIsOn', pageOf(BigInt(hit.address)))}{' '}
        <button type="button" className="link" disabled={Boolean(turn)} onClick={onGoToHit}>{t('book.goBack')}</button>
      </>
    );
  } else if (notice) {
    status = t(notice);
  } else {
    status = edgeNote(addr, twoPage, lang);
  }

  /* Léptetés a találatok között: ugyanaz a sor a könyvtár egy másik lapján (n. találat). */
  const canStep = Boolean(hit?.mode) && Number.isInteger(hit?.n);
  if (canStep) {
    status = (
      <>
        {status}{' '}
        <span className="book-results">
          <button type="button" className="link" disabled={hit.n === 0 || Boolean(turn)} onClick={() => onStepResult(-1)}>{t('book.prevResult')}</button>
          <span>{t('book.resultN', hit.n + 1)}</span>
          <button type="button" className="link" disabled={Boolean(turn)} onClick={() => onStepResult(1)}>{t('book.nextResult')}</button>
        </span>
      </>
    );
  }

  const ariaLabel = t('book.aria', current.vol, pages.map(pageOf));
  const prevLabel = turnLabel(addr, -1, twoPage, lang);
  const nextLabel = turnLabel(addr, 1, twoPage, lang);

  const keptPage = (a) => a !== null && isKept(a.toString());

  /* A lapozás alatti állapot: alul az új pár, fölötte a forduló lap két oldala. */
  let leftAddr = spread.left;
  let rightAddr = spread.right;
  let flip = null;
  if (turn && twoPage) {
    const to = spreadOf(turn.target);
    if (turn.dir > 0) {
      rightAddr = to.right;
      flip = { side: 'right', front: spread.right, back: to.left };
    } else {
      leftAddr = to.left;
      flip = { side: 'left', front: spread.left, back: to.right };
    }
  }
  const textOf = (a) => (a === null ? '' : pageText(a));

  /* Lapkép a jelenlegi lapról: megosztás-menü, ahol van, különben letöltés. */
  const [imaging, setImaging] = useState(false);
  const saveImage = async () => {
    if (imaging) return;
    setImaging(true);
    try {
      // A kártya a látható lapok közül azt mutatja, amelyiken a találat áll (kétoldalas nézetben az lehet a bal is).
      const shot = pages.find((a) => hitOn(a, hit)) ?? addr;
      const h = calculateHierarchy(shot);
      const text = pageText(shot);
      const here = hitOn(shot, hit);
      const full = shot.toString();
      const blob = await renderPageCard({
        text,
        hit: here,
        hexText: hexLabel(h),
        words: {
          title: t('title'),
          line: here ? t('book.cardLine', clip(text.slice(here.start, here.start + here.length))) : '',
          place: `${placeText(h, { lang })} · ${t(`layout.on.${layout}`)}`,
          foot: [
            here ? matchPhrase(here.start, here.length, lang) : '',
            t('book.cardAddress', full.length <= 18 ? full : `${full.slice(0, 12)}…${full.slice(-6)}`, full.length),
          ],
        },
      });
      const name = `babel-${h.hex.slice(0, 8)}-${h.wall}-${h.shelf}-${h.vol}-${h.page}.png`;
      const result = await shareOrSave(blob, name, t('title'));
      if (result === 'saved') onNotify('toast.imageSaved');
    } catch {
      onNotify('toast.imageFailed', true);
    } finally {
      setImaging(false);
    }
  };

  const actions = (
    <>
      {kept ? (
        <span className="kept">
          {t('book.kept')} ·{' '}
          <button type="button" className="link" aria-label={t('book.undoAria', current.page)} onClick={() => onToggleKeep(keepTarget)}>{t('book.undo')}</button>
        </span>
      ) : (
        <button type="button" className="link" title="S" onClick={() => onToggleKeep(keepTarget)}>
          {t('book.keep', current.page)}
        </button>
      )}
      <button type="button" className="link" onClick={() => onCopy('link', address)}>{t('book.copyLink')}</button>
      <button type="button" className="link" onClick={() => onCopy('address', address)}>
        {t(mode === 'phone' ? 'book.copyAddressShort' : 'book.copyAddress')}
      </button>
      <button type="button" className="link" ref={readButtonRef} onClick={() => setSheet('read')}>
        {t(mode === 'phone' ? 'book.readAll' : 'book.readLarge')}
      </button>
      <button type="button" className="link" ref={farButtonRef} onClick={() => setSheet('far')}>{t('book.howFar')}</button>
      <button type="button" className="link" disabled={imaging} onClick={saveImage}>{t('book.image')}</button>
      {mode !== 'phone' && <button type="button" className="link" onClick={() => window.print()}>{t('book.print')}</button>}
    </>
  );

  return (
    <div
      ref={dialogRef}
      className={`book book--${mode}`}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      tabIndex={-1}
      style={{ '--fs': `${fs}px`, '--lh': `${lineHeight(fs)}px`, '--page-w': `${pageWidth(fs)}px` }}
    >
      <div className="book-top" inert={reading}>
        <p className="book-place">
          <span className="mono">{hexLabel(current)}</span> · {placeText(current, { page: false, lang })}
        </p>
        {mode !== 'phone' && <p className="book-status" role="status">{status}</p>}
        <button type="button" className="link" title="Esc" onClick={onClose}>{t('book.putBack')}</button>
      </div>
      {mode === 'phone' && status && <p className="book-status" role="status">{status}</p>}

      <div className="book-stage" inert={reading}>
        {mode === 'phone' ? (
          <PhonePage key={address} addr={addr} text={pageText(addr)} hit={hit} kept={kept} fs={fs} />
        ) : (
          <div className={`book-frame${opening ? ' book-frame--opening' : ''}`}>
            <div className="spread">
              {twoPage && (
                <Leaf
                  addr={leftAddr}
                  side="left"
                  text={textOf(leftAddr)}
                  hit={hit}
                  kept={keptPage(leftAddr)}
                  linesRef={leftLinesRef}
                  linesH={linesH}
                />
              )}
              <Leaf
                addr={rightAddr}
                side={twoPage ? 'right' : 'single'}
                text={textOf(rightAddr)}
                hit={hit}
                kept={keptPage(rightAddr)}
                linesRef={rightLinesRef}
                linesH={linesH}
                fullHead={!twoPage}
              />
              {flip && (
                <div className={`flip flip--${flip.side}`} onAnimationEnd={finishTurn} aria-hidden="true">
                  <div className="flip-face">
                    <Leaf addr={flip.front} side={flip.side} text={textOf(flip.front)} hit={hit} linesH={linesH} />
                  </div>
                  <div className="flip-face flip-face--back">
                    <Leaf addr={flip.back} side={flip.side === 'right' ? 'left' : 'right'} text={textOf(flip.back)} hit={hit} linesH={linesH} />
                  </div>
                </div>
              )}
              {opening && (
                <div className="flip flip--right flip--cover" aria-hidden="true">
                  <div className="flip-face cover">
                    <p className="cover-spine">{bookWord(current.vol, lang)}</p>
                  </div>
                  <div className="flip-face flip-face--back">
                    <Leaf addr={spread.left} side="left" text={textOf(spread.left)} hit={hit} linesH={linesH} />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="book-bottom" inert={reading}>
        {mode === 'phone' && <div className="book-actions">{actions}</div>}
        <div className="book-nav">
          <button type="button" className="link turn" disabled={Boolean(turn)} title="←" onClick={() => turnTo(-1)}>
            ← {prevLabel}
          </button>
          {mode !== 'phone' && <div className="book-actions">{actions}</div>}
          <button type="button" className="link turn" disabled={Boolean(turn)} title="→" onClick={() => turnTo(1)}>
            {nextLabel} →
          </button>
        </div>
        {mode !== 'phone' && <p className="book-keys">{t(canStep ? 'book.keys' : 'book.keysPlain')}</p>}
      </div>

      {sheet === 'read' && <Reader pages={pages} pageText={pageText} hit={hit} onClose={closeReader} />}
      {sheet === 'far' && <Distance addr={addr} onClose={closeReader} />}
      <PrintFolio pages={pages} pageText={pageText} hit={hit} />
      {toast}
    </div>
  );
}
