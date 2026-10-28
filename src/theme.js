// theme.js
// Papír (világos) vagy lámpafény (sötét). Amíg valaki nem választ, a rendszer beállítása dönt;
// a választás a <html data-theme>-be és a localStorage-be kerül. Az index.html egy apró
// szkripttel már a React előtt beállítja, hogy sötét módban ne villanjon fel a papír.
export const THEME_KEY = 'babel_theme';

export function readTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    return saved === 'light' || saved === 'dark' ? saved : null;
  } catch {
    return null;
  }
}

/** A ténylegesen látható téma: a választás, vagy ha nincs, a rendszeré. */
export function effectiveTheme(choice = readTheme()) {
  if (choice) return choice;
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(choice) {
  const root = document.documentElement;
  if (choice) root.dataset.theme = choice;
  else delete root.dataset.theme;
  try {
    if (choice) localStorage.setItem(THEME_KEY, choice);
    else localStorage.removeItem(THEME_KEY);
  } catch { /* nem kritikus */ }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = effectiveTheme(choice) === 'dark' ? '#14110D' : '#EEE6D3';
}
