import { Component, Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getPageText, N, LIBRARY_VERSION } from './core.js';
import { calculateHierarchy, hexLabel, matchPhrase, placeText } from './location.js';
import { applyTheme, effectiveTheme, readTheme } from './theme.js';
import { LANGS, LangContext, detectLang, saveLang, translate, useLang, useT } from './i18n.js';
import { normalizeQuery, describeChanges, joinAnd, placeQuery, PAGE_LENGTH } from './query.js';
import {
  readBookmarks, writeBookmarks, makeBookmark, readLastRead, writeLastRead, readSkipWalk, writeSkipWalk,
} from './storage.js';
import Book from './Book.jsx';
import HexPlan from './HexPlan.jsx';
import AboutView from './AboutView.jsx';
import { LAYOUTS, LayoutContext, readLayout, saveLayout, setLayout, useLayout } from './layout.js';

/* A séta a three.js-sel együtt külön csomagban jön: aki nem sétál, nem tölti le. Amint valaki
   a kereséshez nyúl, előre letöltjük, hogy a séta ne üres papírral induljon. */
const loadWalk = () => import('./walk/EngravedWalk.jsx');
const EngravedWalk = lazy(loadWalk);
let walkPreloaded = false;
function preloadWalk() {
  if (walkPreloaded) return;
  walkPreloaded = true;
  loadWalk().catch(() => { walkPreloaded = false; });
}

function WalkWait({ onSkip }) {
  const t = useT();
  const skipRef = useRef(null);
  useEffect(() => {
    skipRef.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onSkip();
      } else if (e.key === 'Tab') {
        // Egyetlen vezérlő van: a fókusz rajta marad, nem szökik a háttérbe.
        e.preventDefault();
        skipRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onSkip]);
  return (
    <div className="walk-wait" role="dialog" aria-modal="true" aria-label={t('walk.aria')}>
      <p aria-live="polite">{t('walk.wait')}</p>
      <button type="button" className="link" ref={skipRef} onClick={onSkip}>{t('walk.skip')}<span>(Esc)</span></button>
    </div>
  );
}

const VIEWS = ['find', 'address', 'pages', 'about'];

const DATE_FORMAT = {
  en: new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
  hu: new Intl.DateTimeFormat('hu-HU', { year: 'numeric', month: 'short', day: 'numeric' }),
};

function prefersReducedMotion() {
  return typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
}

/**
 * A találat egy lapon (megosztott linkhez, visszatéréshez). Ha ismert a pontos kezdőhely, és ott
 * tényleg a keresett sor áll, az nyer — különben egy korábbi véletlen egyezés (pl. egy „a” betű
 * egy másik szó belsejében) venné el a kiemelést. A régi linkeknél és mentéseknél nincs
 * kezdőhely, ott az első előfordulás marad.
 */
function findHit(address, text, mode = null, at = null, nth = null) {
  if (!text) return null;
  const page = getPageText(BigInt(address));
  const start = Number.isInteger(at) && page.slice(at, at + text.length) === text ? at : page.indexOf(text);
  if (start < 0) return null;
  // Sorszám nélküli (régebbi) mentés vagy link: ha a sor ott áll, ahová az első találat tenné, az az.
  let n = nth;
  if (n === null && mode) {
    const first = placeQuery(text, mode);
    if (first.address.toString() === address && first.start === start) n = 0;
  }
  return { address, start, length: text.length, text, mode, n };
}

/* Egy mentés azonossága: cím + kiadás. Egy v1-es mentés nem a mostani lapot tartja meg. */
const same = (a, b) => a.address === b.address && (a.version ?? 1) === (b.version ?? 1);
const bookmarkKey = (b) => `${b.address}:${b.version ?? 1}`;

/** A találat, ha ezen a lapon van (különben null). */
const hitAt = (hit, address) => (hit?.address === address ? hit : null);

function pageUrl(address, hit) {
  let url = `?addr=${address}&v=${LIBRARY_VERSION}`;
  if (hit) url += `&highlight=${encodeURIComponent(hit.text)}&at=${hit.start}`;
  if (hit?.mode) url += `&mode=${hit.mode}`;
  if (hit?.n > 0) url += `&n=${hit.n}`;
  return url;
}

/** Mi áll az URL-ben: { address, highlight, version } vagy null. */
function readUrl() {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('addr');
  if (!raw || !/^\d+$/.test(raw)) return null;
  const address = BigInt(raw);
  if (address >= N) return null;
  return {
    address: address.toString(),
    highlight: normalizeQuery(params.get('highlight') ?? '').text,
    at: /^\d+$/.test(params.get('at') ?? '') ? Number(params.get('at')) : null,
    mode: ['exact', 'substring'].includes(params.get('mode')) ? params.get('mode') : null,
    nth: /^\d{1,9}$/.test(params.get('n') ?? '') ? Number(params.get('n')) : null,
    version: Number(params.get('v') ?? LIBRARY_VERSION),
  };
}

function randomAddress() {
  let hex = '0x';
  for (let i = 0; i < 4000; i++) hex += Math.floor(Math.random() * 16).toString(16);
  return BigInt(hex) % N;
}

/** Mit nem lehet címként elfogadni, és miért — vagy a cím maga. */
function parseAddress(raw, lang) {
  const t = (key, ...args) => translate(lang, key, ...args);
  const s = raw.trim();
  if (!s) return { error: t('address.err.empty') };
  const fromLink = s.match(/[?&]addr=(\d+)/);
  const digits = fromLink ? fromLink[1] : s;
  if (/^\d+$/.test(digits)) {
    const address = BigInt(digits);
    if (address >= N) {
      return { error: t('address.err.tooBig') };
    }
    return { address };
  }
  if (/…|·|wall|shelf|book|fal|polc|könyv/.test(s)) return { error: t('address.err.place') };
  const bad = Array.from(new Set(s.replace(/\d/g, ''))).map((c) => {
    if (c === ' ') return t('address.bad.space');
    if (c === '\n' || c === '\r') return t('address.bad.lines');
    return t('address.bad.char', c);
  });
  const list = Array.from(new Set(bad));
  const shown = joinAnd(list.length > 3 ? [...list.slice(0, 3), t('address.bad.rest')] : list, lang);
  return { error: t('address.err.notNumber', shown) };
}

/** Ha a séta csomagja nem tölt be, egyenesen a könyvhöz megyünk. */
class WalkBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onFail(); }
  render() { return this.state.failed ? null : this.props.children; }
}

function Place({ h, page = true }) {
  const lang = useLang();
  return (
    <>
      <span className="mono">{hexLabel(h)}</span> · {placeText(h, { page, lang })}
    </>
  );
}

function bookmarkTitle(bm, h, t) {
  if (bm.name) return bm.name;
  if (bm.highlight) return t('quote', bm.highlight);
  return t('pages.untitled', h);
}

function bookmarkNote(bm, t, lang) {
  if ((bm.version ?? 1) !== LIBRARY_VERSION) return t('pages.legacy');
  if (bm.highlight) {
    const hit = findHit(bm.address, bm.highlight, bm.matchMode, bm.start, bm.nth);
    const how = t(bm.matchMode === 'substring' ? 'pages.foundSubstring' : bm.matchMode === 'exact' ? 'pages.foundExact' : 'pages.found');
    return hit ? `${how} — ${matchPhrase(hit.start, hit.length, lang)}.` : `${how}.`;
  }
  if (bm.origin === 'random') return t('pages.random');
  if (bm.origin === 'address') return t('pages.byAddress');
  return '';
}

function FindView({ onPrepare, onSearch, onRandomPage, onRandomBook, onAddress, lastRead, onReturn, oldLink, onOpenOld, onDismissOld }) {
  const layout = useLayout();
  const t = useT();
  const lang = useLang();
  const [input, setInput] = useState('');
  const [mode, setMode] = useState('exact');
  const [error, setError] = useState('');
  const normalized = useMemo(() => normalizeQuery(input), [input]);
  const changes = useMemo(() => describeChanges(input, lang), [input, lang]);
  const tooLong = normalized.text.length > PAGE_LENGTH;

  const submit = (event) => {
    event.preventDefault();
    if (normalized.text.length === 0) {
      setError(t(input.trim() ? 'find.nothingLeft' : 'find.empty'));
      return;
    }
    setError('');
    onSearch(normalized.text, mode);
  };

  const lastH = lastRead ? calculateHierarchy(BigInt(lastRead.address)) : null;

  return (
    <div className="landing">
      <main className="landing-main">
        <div className="intro">
          <h1 className="display">{t('title')}</h1>
          <p className="lede">{t('find.lede')}</p>
        </div>

        {oldLink && (
          <section className="notice" aria-label={t('old.aria')}>
            <p>{t('old.text')}</p>
            <p className="link-row">
              <button type="button" className="link" onClick={onOpenOld}>{t('old.open')}</button>
              <button type="button" className="link" onClick={onDismissOld}>{t('old.restart')}</button>
            </p>
          </section>
        )}

        <form className="find" onSubmit={submit} noValidate>
          <label className="field-label" htmlFor="find-input">{t('find.label')}</label>
          <div className="find-row">
            <input
              id="find-input"
              className="find-input"
              type="text"
              value={input}
              autoComplete="off"
              spellCheck="false"
              placeholder={t('find.placeholder')}
              aria-describedby="find-rule find-changes"
              aria-invalid={Boolean(error)}
              onChange={(e) => { setInput(e.target.value); setError(''); }}
              onFocus={onPrepare}
            />
            <button type="submit" className="btn-ink">{t('find.submit')}</button>
          </div>
          <p id="find-rule" className="rule">
            {t('find.ruleA')} <code>, . ? ! -</code>{t('find.ruleB')}
          </p>
          <div id="find-changes" aria-live="polite">
            {changes.length > 0 && normalized.text && (
              <p className="changes">
                {t('find.willLook')} <code>{normalized.text.slice(0, 120)}{normalized.text.length > 120 ? '…' : ''}</code>{' '}
                — {joinAnd(changes, lang)}.
              </p>
            )}
            {tooLong && (
              <p className="changes">{t('find.tooLong')}</p>
            )}
          </div>
          {error && <p className="error" role="alert">{error}</p>}
          <fieldset className="modes">
            <legend className="sr-only">{t('find.modes')}</legend>
            <label>
              <input type="radio" name="mode" checked={mode === 'exact'} onChange={() => setMode('exact')} />
              {t('find.exact')}
            </label>
            <label>
              <input type="radio" name="mode" checked={mode === 'substring'} onChange={() => setMode('substring')} />
              {t('find.substring')}
            </label>
          </fieldset>
        </form>

        <p className="random" onPointerEnter={onPrepare} onFocus={onPrepare}>
          <span className="random-lead">{t('random.lead')}</span>
          <button type="button" className="link" onClick={onRandomPage}>{t('random.page')}</button>
          <button type="button" className="link" onClick={onRandomBook}>{t('random.book')}</button>
          <button type="button" className="link only-narrow" onClick={onAddress}>{t('random.address')}</button>
        </p>

        {lastRead && lastH && (
          <section className="last-read" aria-label={t('last.label')}>
            <div>
              <p className="smallcaps">{t('last.label')}</p>
              <p className="last-title">
                {lastRead.highlight ? t('quote', lastRead.highlight) : lastRead.origin === 'random' ? t('last.random') : t('last.page', lastH)}
              </p>
              <p className="meta"><Place h={lastH} /></p>
            </div>
            <button type="button" className="link link--large" onClick={onReturn}>{t('last.back')}</button>
          </section>
        )}
      </main>

      <figure className="plan">
        <HexPlan label={t(`fig.aria.${layout}`)} />
        <figcaption>
          <span className="smallcaps">{t('fig.label')}</span> {t(`fig.caption.${layout}`)}
          <span className="footnote">{t('fig.note')}</span>
        </figcaption>
      </figure>
    </div>
  );
}

function AddressView({ onGo, skipWalk, onSkipWalkChange, onAddressZero }) {
  const t = useT();
  const lang = useLang();
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const digits = (input.match(/\d/g) ?? []).length;

  const submit = (event) => {
    event.preventDefault();
    const result = parseAddress(input, lang);
    if (result.error) {
      setError(result.error);
      return;
    }
    setError('');
    onGo(result.address);
  };

  return (
    <div className="address-view">
      <form className="address-form" onSubmit={submit} noValidate>
        <h1 className="display display--page">{t('address.title')}</h1>
        <p className="lede lede--small">
          {t('address.ledeA')}<sup>3200</sup>{t('address.ledeB')}
        </p>
        <label className="field-label" htmlFor="address-input">{t('address.label')}</label>
        <textarea
          id="address-input"
          className="address-input"
          rows={7}
          spellCheck="false"
          autoComplete="off"
          inputMode="numeric"
          value={input}
          aria-invalid={Boolean(error)}
          aria-describedby="address-count"
          onChange={(e) => { setInput(e.target.value); setError(''); }}
        />
        {error && <p className="error" role="alert">{error}</p>}
        <div className="address-row">
          <p id="address-count" className="meta">
            {t('address.count', digits)}
          </p>
          <button type="submit" className="btn-ink">{t('address.submit')}</button>
        </div>
        <label className="check">
          <input type="checkbox" checked={skipWalk} onChange={(e) => onSkipWalkChange(e.target.checked)} />
          {t('address.skip')}
        </label>
      </form>
      <aside className="aside">
        <p className="smallcaps">{t('address.asideTitle')}</p>
        <p>{t('address.aside1')}</p>
        <p>{t('address.aside2')}</p>
        <p>
          {t('address.aside3a')}{' '}
          <button type="button" className="link" onClick={onAddressZero}>{t('address.zero')}</button>{t('address.aside3b')}
        </p>
      </aside>
    </div>
  );
}

function PagesView({ bookmarks, onOpen, onRename, onRemove, onFind }) {
  const t = useT();
  const lang = useLang();
  const [editing, setEditing] = useState(null);
  const inputRef = useRef(null);

  const editingKey = editing?.key;
  useEffect(() => {
    if (editingKey) inputRef.current?.focus();
  }, [editingKey]);

  const commit = () => {
    if (!editing) return;
    onRename(editing.bm, editing.value.trim());
    setEditing(null);
  };

  return (
    <div className="pages-view">
      <div className="pages-head">
        <h1 className="display display--page">{t('pages.title')}</h1>
        <p className="meta">{t('pages.sub')}</p>
      </div>
      {bookmarks.length === 0 ? (
        <section className="empty">
          <p className="empty-title">{t('pages.emptyTitle')}</p>
          <p>{t('pages.emptyText')}</p>
          <button type="button" className="link link--large" onClick={onFind}>{t('pages.findLink')}</button>
        </section>
      ) : (
        <ol className="register" aria-label={t('pages.aria')}>
          {bookmarks.map((bm) => {
            const h = calculateHierarchy(BigInt(bm.address));
            const isEditing = editing?.key === bookmarkKey(bm);
            const title = bookmarkTitle(bm, h, t);
            const note = bookmarkNote(bm, t, lang);
            return (
              <li key={bookmarkKey(bm)} className="register-row">
                <div className="register-title">
                  {isEditing ? (
                    <label className="rename">
                      {t('pages.name')}
                      <input
                        ref={inputRef}
                        type="text"
                        value={editing.value}
                        onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { e.preventDefault(); commit(); }
                          if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setEditing(null); }
                        }}
                      />
                    </label>
                  ) : (
                    <h2>{title}</h2>
                  )}
                  {note && <p className="meta">{note}</p>}
                </div>
                <p className="register-place"><Place h={h} /></p>
                <p className="meta register-date">{bm.savedAt ? (DATE_FORMAT[lang] ?? DATE_FORMAT.en).format(new Date(bm.savedAt)) : '—'}</p>
                <div className="register-actions">
                  <button type="button" className="link" onClick={() => onOpen(bm)} aria-label={t('pages.openAria', title)}>{t('pages.open')}</button>
                  {isEditing ? (
                    <button type="button" className="link" onClick={commit}>{t('pages.done')}</button>
                  ) : (
                    <button type="button" className="link" onClick={() => setEditing({ key: bookmarkKey(bm), bm, value: bm.name ?? '' })} aria-label={t('pages.renameAria', title)}>{t('pages.rename')}</button>
                  )}
                  <button type="button" className="link link--quiet" onClick={() => onRemove(bm)} aria-label={t('pages.removeAria', title)}>{t('pages.remove')}</button>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      <p className="meta pages-foot">{t('pages.foot')}</p>
    </div>
  );
}

export default function App() {
  const [lang, setLang] = useState(detectLang);
  const [themeChoice, setThemeChoice] = useState(readTheme);
  /* A polcok elrendezése: Borges szerint vagy telt falak. A lapok és a címek ugyanazok, csak a hely
   * (hatszög, fal, polc, könyv) számolódik másképp; a modul állapotát a render előtt állítjuk. */
  const [layout, setLayoutState] = useState(() => {
    const initial = readLayout();
    setLayout(initial);
    return initial;
  });
  const changeLayout = useCallback((id) => {
    setLayout(id);
    saveLayout(id);
    setLayoutState(id);
  }, []);
  const [systemDark, setSystemDark] = useState(() => effectiveTheme(null) === 'dark');
  const theme = themeChoice ?? (systemDark ? 'dark' : 'light');
  const t = useCallback((key, ...args) => translate(lang, key, ...args), [lang]);
  const [view, setView] = useState('find');
  const [bookmarks, setBookmarks] = useState(readBookmarks);
  const [lastRead, setLastRead] = useState(readLastRead);
  const [skipWalk, setSkipWalk] = useState(readSkipWalk);
  const [oldLink, setOldLink] = useState(null);
  const [walking, setWalking] = useState(null);
  const [reading, setReading] = useState(null);
  const [toast, setToast] = useState(null);

  const reducedMotion = useMemo(prefersReducedMotion, []);
  const toastTimer = useRef(null);
  /* Igaz, ha a mostani olvasó-bejegyzést mi toltuk az előzménybe: akkor a „Put it back” = Back.
     A jelölő a history.state-ben is él, így Forward és újratöltés után sem vész el. */
  const pushedRef = useRef(false);
  /* A legfrissebb lista: a visszavonás ehhez képest dolgozik, nem egy régi pillanatképhez. */
  const bookmarksRef = useRef(bookmarks);
  const landingRef = useRef(null);

  const showToast = useCallback((message, action = null, alert = false) => {
    clearTimeout(toastTimer.current);
    setToast({ message, action, alert, id: Date.now() });
    toastTimer.current = setTimeout(() => setToast(null), 6000);
  }, []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const remember = useCallback((address, hit, origin) => {
    const here = hitAt(hit, address);
    const entry = { address, highlight: here?.text ?? '', start: here?.start ?? null, origin, matchMode: here?.mode ?? null, nth: here?.n ?? null };
    writeLastRead(entry);
    setLastRead({ ...entry, version: LIBRARY_VERSION });
  }, []);

  /** A könyv kinyitása (séta nélkül): új előzmény-bejegyzés, hogy a Back becsukja. */
  const showBook = useCallback(({ address, hit = null, origin = 'unknown', notice = '' }) => {
    setReading({ address, hit, origin, notice });
    window.history.pushState({ addr: address, ours: true }, '', pageUrl(address, hitAt(hit, address)));
    pushedRef.current = true;
    remember(address, hit, origin);
  }, [remember]);

  const open = useCallback((address, { hit = null, origin = 'unknown', walk = true } = {}) => {
    const pending = { address: address.toString(), hit, origin };
    if (walk && !skipWalk && !reducedMotion) {
      setWalking({ ...pending, hierarchy: calculateHierarchy(address) });
    } else {
      showBook(pending);
    }
  }, [skipWalk, reducedMotion, showBook]);

  /* A séta lezárása egyszer nyit könyvet: a ref akkor is véd, ha a Skip és a vég egybeesik. */
  const walkingRef = useRef(null);
  walkingRef.current = walking;
  const finishWalk = useCallback(() => {
    const w = walkingRef.current;
    walkingRef.current = null;
    setWalking(null);
    if (w) showBook(w);
  }, [showBook]);

  /* Megosztott link és a Back gomb: az URL dönt, séta nélkül. */
  useEffect(() => {
    const fromUrl = (initial) => {
      const target = readUrl();
      setWalking(null);
      if (!target) {
        setReading(null);
        return;
      }
      if (target.version !== LIBRARY_VERSION) {
        if (initial) setOldLink(target);
        setReading(null);
        return;
      }
      const hit = findHit(target.address, target.highlight, target.mode, target.at, target.nth);
      setReading({ address: target.address, hit, origin: 'link', notice: '' });
      pushedRef.current = Boolean(window.history.state?.ours);
      remember(target.address, hit, 'link');
    };
    fromUrl(true);
    const onPopState = () => fromUrl(false);
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [remember]);

  const closeBook = useCallback(() => {
    if (pushedRef.current) {
      pushedRef.current = false;
      window.history.back();
    } else {
      window.history.replaceState(null, '', window.location.pathname);
    }
    setReading(null);
    requestAnimationFrame(() => landingRef.current?.focus());
  }, []);

  /* Lapozás: ugyanaz az előzmény-bejegyzés, csak a cím változik — 50 lapozás nem 50 Back. */
  const turnTo = useCallback((target) => {
    if (!reading) return;
    const address = target.toString();
    window.history.replaceState({ ...window.history.state, addr: address }, '', pageUrl(address, hitAt(reading.hit, address)));
    remember(address, reading.hit, reading.origin);
    setReading({ ...reading, address, notice: '' });
  }, [reading, remember]);

  /* Léptetés a találatok között: ugyanaz a sor az n ± 1. lapon. Lapozásként viselkedik (egy
   * előzmény-bejegyzés), de a találat is vele változik. */
  const stepResult = useCallback((dir) => {
    const hit = reading?.hit;
    if (!hit?.mode || !Number.isInteger(hit.n)) return;
    const n = hit.n + dir;
    if (n < 0) return;
    const placed = placeQuery(hit.text, hit.mode, n);
    const address = placed.address.toString();
    const next = { address, start: placed.start, length: placed.length, text: placed.text, mode: hit.mode, n };
    window.history.replaceState({ ...window.history.state, addr: address }, '', pageUrl(address, next));
    remember(address, next, 'search');
    setReading({ ...reading, address, hit: next, origin: 'search', notice: '' });
  }, [reading, remember]);

  const goToHit = useCallback(() => {
    if (reading?.hit) turnTo(BigInt(reading.hit.address));
  }, [reading, turnTo]);

  /** Előbb a tároló, utána a képernyő: ami nem íródott ki, az nem is látszik megtörténtnek. */
  const saveBookmarks = useCallback((next) => {
    if (!writeBookmarks(next)) return false;
    bookmarksRef.current = next;
    setBookmarks(next);
    return true;
  }, []);

  const storageFailed = useCallback((what, address) => {
    showToast(t('toast.storage', t(what)), address ? {
      label: t('toast.copyInstead'),
      run: () => copyRef.current('link', address),
    } : null, true);
  }, [showToast, t]);

  const copy = useCallback(async (kind, address) => {
    const value = kind === 'link'
      ? `${window.location.origin}${window.location.pathname}${pageUrl(address, hitAt(reading?.hit, address))}`
      : address;
    try {
      await navigator.clipboard.writeText(value);
      showToast(kind === 'link' ? t('toast.linkCopied') : t('toast.addressCopied', address.length));
    } catch {
      showToast(t('toast.copyFailed'), null, true);
    }
  }, [reading, showToast, t]);
  const copyRef = useRef(copy);
  copyRef.current = copy;

  const isKept = useCallback(
    (address) => bookmarks.some((b) => b.address === address && b.version === LIBRARY_VERSION),
    [bookmarks],
  );

  /** Visszavonás inverz műveletként: csak az érintett bejegyzés kerül vissza, a helyére. */
  const removeBookmark = useCallback((target, message) => {
    const list = bookmarksRef.current;
    const index = list.findIndex((b) => same(b, target));
    if (index < 0) return;
    const removed = list[index];
    if (!saveBookmarks(list.filter((b) => !same(b, target)))) {
      storageFailed('storage.change');
      return;
    }
    showToast(t(message), {
      label: t('toast.undo'),
      run: () => {
        const now = bookmarksRef.current;
        if (!now.some((b) => same(b, removed))) {
          const next = [...now];
          next.splice(Math.min(index, next.length), 0, removed);
          if (!saveBookmarks(next)) storageFailed('storage.putBack');
        }
        setToast(null);
      },
    });
  }, [saveBookmarks, showToast, storageFailed, t]);

  const toggleKeep = useCallback((address) => {
    const current = { address, version: LIBRARY_VERSION };
    if (isKept(address)) {
      removeBookmark(current, 'toast.takenOff');
      return;
    }
    const hitHere = hitAt(reading?.hit, address);
    const origin = hitHere ? 'search' : reading?.origin === 'random' || reading?.origin === 'address' ? reading.origin : 'unknown';
    const entry = makeBookmark({
      address, highlight: hitHere?.text ?? '', start: hitHere?.start ?? null, matchMode: hitHere?.mode ?? null, origin, nth: hitHere?.n ?? null,
    });
    if (!saveBookmarks([entry, ...bookmarksRef.current])) {
      storageFailed('storage.keep', address);
      return;
    }
    showToast(t('toast.kept'), {
      label: t('toast.undo'),
      run: () => {
        if (!saveBookmarks(bookmarksRef.current.filter((b) => !same(b, current)))) storageFailed('storage.undo');
        setToast(null);
      },
    });
  }, [isKept, removeBookmark, reading, saveBookmarks, showToast, storageFailed, t]);

  const renameBookmark = useCallback((target, name) => {
    const next = bookmarksRef.current.map((b) => (same(b, target) ? { ...b, name: name || null } : b));
    if (!saveBookmarks(next)) storageFailed('storage.name');
  }, [saveBookmarks, storageFailed]);

  const changeLang = useCallback((next) => {
    setLang(next);
    saveLang(next);
  }, []);

  /* A dokumentum nyelve és címe kövesse a választást (felolvasó, fordító, fül-cím). */
  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = translate(lang, 'title');
  }, [lang]);

  /* A rendszer váltását is kövessük, amíg nincs saját választás. */
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    const onChange = (e) => setSystemDark(e.matches);
    mq?.addEventListener?.('change', onChange);
    return () => mq?.removeEventListener?.('change', onChange);
  }, []);

  useEffect(() => {
    applyTheme(themeChoice);
  }, [themeChoice, systemDark]);

  const changeSkipWalk = useCallback((value) => {
    setSkipWalk(value);
    writeSkipWalk(value);
  }, []);

  const search = useCallback((text, mode) => {
    const placed = placeQuery(text, mode);
    const address = placed.address.toString();
    open(placed.address, { hit: { address, start: placed.start, length: placed.length, text: placed.text, mode, n: 0 }, origin: 'search' });
  }, [open]);

  const overlayOpen = Boolean(walking || reading);

  /* Olvasás közben az értesítő a dialóguson belül él, hogy a fókuszcsapdán belül elérhető legyen. */
  const toastEl = toast && (
    <div key={toast.id} className={`toast${reading ? ' toast--top' : ''}`} role={toast.alert ? 'alert' : 'status'}>
      <span>{toast.message}</span>
      {toast.action && (
        <button type="button" className="link link--inverse" onClick={toast.action.run}>{toast.action.label}</button>
      )}
    </div>
  );

  return (
    <LangContext.Provider value={lang}>
    <LayoutContext.Provider value={layout}>
      <div className="site" inert={overlayOpen}>
        <header className="masthead">
          <button type="button" className="wordmark" onClick={() => setView('find')}>{t('title')}</button>
          <nav aria-label={t('nav.aria')} className="sections">
            {VIEWS.map((id) => (
              <button
                key={id}
                type="button"
                className={`nav-link${id === 'find' || id === 'address' || id === 'about' ? ' nav-link--wide' : ''}`}
                aria-current={view === id ? 'page' : undefined}
                onClick={() => setView(id)}
              >
                {t(`nav.${id}`)}
                {id === 'pages' && <span className="count">{bookmarks.length}</span>}
              </button>
            ))}
          </nav>
        </header>

        <div className="view" ref={landingRef} tabIndex={-1}>
          {view === 'find' && (
            <FindView
              onPrepare={skipWalk || reducedMotion ? undefined : preloadWalk}
              onSearch={search}
              onRandomPage={() => open(randomAddress(), { origin: 'random' })}
              onRandomBook={() => {
                const address = randomAddress();
                open(address - (address % 410n), { origin: 'random' });
              }}
              onAddress={() => setView('address')}
              lastRead={lastRead}
              onReturn={() => showBook({
                address: lastRead.address,
                hit: findHit(lastRead.address, lastRead.highlight, lastRead.matchMode, lastRead.start, lastRead.nth),
                origin: lastRead.origin,
              })}
              oldLink={oldLink}
              onOpenOld={() => {
                const target = oldLink;
                setOldLink(null);
                showBook({
                  address: target.address,
                  hit: findHit(target.address, target.highlight, target.mode, target.at, target.nth),
                  origin: 'link',
                  notice: 'notice.oldLink',
                });
              }}
              onDismissOld={() => {
                setOldLink(null);
                window.history.replaceState(null, '', window.location.pathname);
              }}
            />
          )}
          {view === 'address' && (
            <AddressView
              onGo={(address) => open(address, { origin: 'address' })}
              skipWalk={skipWalk}
              onSkipWalkChange={changeSkipWalk}
              onAddressZero={() => open(0n, { origin: 'address' })}
            />
          )}
          {view === 'about' && <AboutView />}
          {view === 'pages' && (
            <PagesView
              bookmarks={bookmarks}
              onOpen={(bm) => showBook({
                address: bm.address,
                // Egy régi kiadásban mentett sor itt már nem áll: nincs mit kiemelni.
                hit: bm.version === LIBRARY_VERSION ? findHit(bm.address, bm.highlight, bm.matchMode, bm.start, bm.nth) : null,
                origin: bm.origin,
                notice: bm.version !== LIBRARY_VERSION ? 'notice.oldKept' : '',
              })}
              onRename={renameBookmark}
              onRemove={(bm) => removeBookmark(bm, 'toast.removed')}
              onFind={() => setView('find')}
            />
          )}
        </div>

        <footer className="colophon">
          <p>
            {t('colophon.after')} <i>La biblioteca de Babel</i> · Buenos Aires, 1941 ·{' '}
            <button type="button" className="link" onClick={() => { setView('about'); window.scrollTo(0, 0); }}>{t('nav.about')}</button>
          </p>
          <p className="colophon-end">
            <span>{t('colophon.private')}</span>
            <span className="langs" role="group" aria-label={t('theme.aria')}>
              {['light', 'dark'].map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className="lang"
                  aria-pressed={theme === mode}
                  onClick={() => setThemeChoice(mode)}
                >
                  {t(`theme.${mode}`)}
                </button>
              ))}
            </span>
            <span className="langs" role="group" aria-label={t('layout.aria')} title={t('layout.hint')}>
              {LAYOUTS.map((id) => (
                <button key={id} type="button" className="lang" aria-pressed={layout === id} onClick={() => changeLayout(id)}>
                  {t(`layout.${id}`)}
                </button>
              ))}
            </span>
            <span className="langs" role="group" aria-label={t('lang.aria')}>
              {LANGS.map((code) => (
                <button
                  key={code}
                  type="button"
                  className="lang"
                  lang={code}
                  aria-pressed={lang === code}
                  onClick={() => changeLang(code)}
                >
                  {code === 'en' ? 'English' : 'Magyar'}
                </button>
              ))}
            </span>
          </p>
        </footer>
      </div>

      {walking && (
        <WalkBoundary onFail={finishWalk}>
          <Suspense fallback={<WalkWait onSkip={finishWalk} />}>
            <EngravedWalk
              hierarchy={walking.hierarchy}
              layout={layout}
              onComplete={finishWalk}
              onSkip={finishWalk}
              alwaysSkip={skipWalk}
              onAlwaysSkipChange={changeSkipWalk}
            />
          </Suspense>
        </WalkBoundary>
      )}

      {reading && (
        <Book
          key={reading.notice ? 'old' : 'book'}
          address={reading.address}
          hit={reading.hit}
          pageText={getPageText}
          isKept={isKept}
          notice={reading.notice}
          reducedMotion={reducedMotion}
          onTurn={turnTo}
          onGoToHit={goToHit}
          onClose={closeBook}
          onToggleKeep={toggleKeep}
          onCopy={copy}
          onStepResult={stepResult}
          onNotify={(key, alert = false) => showToast(t(key), null, alert)}
          toast={toastEl}
        />
      )}

      {toast && !reading && toastEl}
    </LayoutContext.Provider>
    </LangContext.Provider>
  );
}
