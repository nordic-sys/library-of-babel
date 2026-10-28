// i18n.js
// A felület két nyelve, angol és magyar. Minden felhasználói szöveg innen jön; a hely szavai
// (fal, polc, könyv, oldal, lapozó-feliratok) a location.js-ben, a „mi lett a soromból” a
// query.js-ben élnek, ugyanazzal a `lang` kóddal.
//
// A magyar szövegek szándékosan úgy vannak fogalmazva, hogy számjegy után ne kelljen ragot vagy
// névelőt választani („88. oldal”, nem „a 88. oldalon”): a számok kiejtéséből adódó a/az és
// -on/-en/-ön kódból megbízhatatlan volna.
import { createContext, useCallback, useContext } from 'react';

export const LANGS = ['en', 'hu'];
const LANG_KEY = 'babel_lang';

export function detectLang() {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (LANGS.includes(saved)) return saved;
  } catch { /* privát mód: a böngésző nyelve dönt */ }
  const nav = typeof navigator === 'undefined' ? '' : (navigator.languages?.[0] ?? navigator.language ?? '');
  return nav.toLowerCase().startsWith('hu') ? 'hu' : 'en';
}

export function saveLang(lang) {
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch { /* nem kritikus */ }
}

const EN_ORD = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth'];
const EN_CARD = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const EN_TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
/** Angol tőszámnév 0–199 (a telt falon egy polcon 104 könyv is áll). */
function enCardinal(n) {
  if (n >= 100) return n === 100 ? 'one hundred' : `one hundred and ${enCardinal(n - 100)}`;
  if (n < 20) return EN_CARD[n];
  const tens = EN_TENS[Math.floor(n / 10)];
  return n % 10 ? `${tens}-${EN_CARD[n % 10]}` : tens;
}

/**
 * Magyar sorszámnév 1–199: első, második, …, tizenegyedik, huszonnegyedik, negyvenedik,
 * száznegyedik (a telt falon egy polcon 104 könyv is áll).
 */
const HU_UNIT = ['', 'egyedik', 'kettedik', 'harmadik', 'negyedik', 'ötödik', 'hatodik', 'hetedik', 'nyolcadik', 'kilencedik'];
const HU_TENS_ORD = ['', 'tizedik', 'huszadik', 'harmincadik', 'negyvenedik', 'ötvenedik', 'hatvanadik', 'hetvenedik', 'nyolcvanadik', 'kilencvenedik'];
const HU_TENS = ['', 'tizen', 'huszon', 'harminc', 'negyven', 'ötven', 'hatvan', 'hetven', 'nyolcvan', 'kilencven'];
function huTail(n) {
  if (n < 10) return HU_UNIT[n];
  const tens = Math.floor(n / 10);
  const unit = n % 10;
  return unit === 0 ? HU_TENS_ORD[tens] : HU_TENS[tens] + HU_UNIT[unit];
}
export function huOrdinal(n) {
  if (n === 1) return 'első';
  if (n === 2) return 'második';
  if (n >= 100) return n === 100 ? 'századik' : `száz${huTail(n - 100)}`;
  return huTail(n);
}

const STRINGS = {
  en: {
    title: 'The Library of Babel',
    quote: (x) => `“${x}”`,
    'nav.aria': 'Sections',
    'nav.find': 'Find a line',
    'nav.address': 'Go to an address',
    'nav.pages': 'Your pages',
    'nav.about': 'About',
    'lang.aria': 'Language',
    'theme.aria': 'Light',
    'theme.light': 'Paper',
    'theme.dark': 'Lamplight',
    'layout.aria': 'Shelving',
    'layout.borges': 'As Borges wrote',
    'layout.dense': 'Full walls',
    'layout.hint': 'As Borges wrote: 5 shelves of 32 books to a wall. Full walls: shelves from floor to ceiling, full of real-sized books. The pages are the same; only their place changes.',

    'walk.aria': 'Walking to the book',
    'walk.wait': 'Through the galleries…',
    'walk.towards': 'Through the galleries, towards',
    'walk.hexagon': 'Hexagon',
    'walk.skip': 'Skip the walk',
    'walk.dontWalk': 'Don’t walk next time',
    'walk.place': (h, step) => {
      const parts = [`the ${EN_ORD[h.wall - 1]} wall`, `the ${EN_ORD[h.shelf - 1]} shelf`, `book ${enCardinal(h.vol)}`];
      const text = parts.slice(0, step).join(' · ');
      return text.charAt(0).toUpperCase() + text.slice(1);
    },

    'find.lede': 'Every page of 3,200 characters is already on a shelf here. Write a line, and the library will tell you where it stands.',
    'find.label': 'A line, a name, anything',
    'find.placeholder': 'e.g. the unimaginable centre',
    'find.submit': 'Find its shelf',
    'find.ruleA': 'Twenty-six lowercase letters, the space, and',
    'find.ruleB': '. Accents fold (á → a); anything else is left out.',
    'find.willLook': 'The library will look for',
    'find.tooLong': 'A page holds 3,200 characters; only the first 3,200 of yours will fit, the rest is left out.',
    'find.empty': 'Write a line first — a few words, a name, anything.',
    'find.nothingLeft': 'Nothing is left to look for: the library holds only a–z, the space and , . ? ! -',
    'find.modes': 'How to place it',
    'find.exact': 'As whole words',
    'find.substring': 'Anywhere, even inside other words',
    'random.lead': 'Or take one down at random:',
    'random.page': 'any page',
    'random.book': 'any book, from its first page',
    'random.address': 'an address…',
    'last.label': 'You were reading',
    'last.random': 'a page taken down at random',
    'last.page': (h) => `page ${h.page} of book ${h.vol}`,
    'last.back': 'Go back to it →',
    'old.aria': 'A link from an older edition',
    'old.text': 'This link was made for an earlier edition of the library. The numbering has changed since, so the same address now opens a different page.',
    'old.open': 'Open it anyway',
    'old.restart': 'Start from the beginning',
    'fig.label': 'Fig. 1.',
    'fig.caption.borges': 'The galleries, in plan. Each hexagon has four walls of shelves around an airshaft with a very low railing; its free sides open onto narrow hallways with the stairs, leading on to the next hexagon of the same gallery. Galleries side by side never meet: from a hexagon one goes only along its gallery, or up and down. Yours is drawn in red. The drawing stops at the edge of the page. The library does not.',
    'fig.caption.dense': 'The galleries, in plan. Each hexagon has four walls of shelves around an airshaft with a very low railing. In the middle of each shelf wall a narrow door, framed by books, leads to the next hexagon; the two free sides open onto hallways with the stairs. Yours is drawn in red. The drawing stops at the edge of the page. The library does not.',
    'fig.note': 'Borges counted twenty-five symbols; this library needs thirty-two.',
    'fig.aria.borges': 'Plan of the galleries: hexagons repeating in every direction, each with four unbroken walls of shelves around an airshaft and two hallways leading along its gallery; your hexagon is outlined in red',
    'fig.aria.dense': 'Plan of the galleries: hexagons repeating in every direction, each with four walls of shelves around an airshaft, a door framed by books in every wall and two hallways; your hexagon is outlined in red',

    'address.title': 'Go to an address',
    'address.ledeA': 'Every page has one address: a single whole number, from 0 up to 32',
    'address.ledeB': ' − 1. The longest run to 4,817 digits, so paste it rather than type it.',
    'address.label': 'The address',
    'address.count': (n) => `${n.toLocaleString('en')} ${n === 1 ? 'digit' : 'digits'} · a whole number, nothing else`,
    'address.submit': 'Go to it',
    'address.skip': 'Open the book directly, without the walk',
    'address.asideTitle': 'Where addresses come from',
    'address.aside1': 'Under any open book, “Copy the address” gives you its number. A link someone sends you carries the same number, so it opens the same page — you can paste the whole link here, too.',
    'address.aside2': 'The hexagon, wall, shelf, book and page are read off the number; you cannot choose them one by one.',
    'address.aside3a': 'Or start from nothing:',
    'address.zero': 'address 0',
    'address.aside3b': ', the first page of the first book.',
    'address.err.empty': 'Paste or type an address first — a whole number, such as 0.',
    'address.err.tooBig': 'That number runs past the last page. The largest address is 32^3200 − 1, which is 4,817 digits long.',
    'address.err.place': 'That is the book’s place, not its address. Under an open book, “Copy the address” gives you the whole number.',
    'address.err.notNumber': (shown) => `That isn’t an address. An address is one whole number — take out ${shown}, and try again.`,
    'address.bad.space': 'the spaces',
    'address.bad.lines': 'the line breaks',
    'address.bad.char': (c) => `the “${c}”`,
    'address.bad.rest': 'the rest',

    'pages.title': 'Your pages',
    'pages.sub': 'Kept in this browser, newest first.',
    'pages.emptyTitle': 'Nothing kept yet.',
    'pages.emptyText': 'While you read, press S or choose “Keep” under the book. Kept pages stay in this browser and nowhere else.',
    'pages.findLink': 'Find a line →',
    'pages.aria': 'Kept pages',
    'pages.name': 'Name',
    'pages.open': 'Open',
    'pages.done': 'Done',
    'pages.rename': 'Rename',
    'pages.remove': 'Remove',
    'pages.openAria': (t) => `Open ${t}`,
    'pages.renameAria': (t) => `Rename ${t}`,
    'pages.removeAria': (t) => `Remove ${t}`,
    'pages.foot': 'To keep a page, press S while you read, or choose “Keep” under the book.',
    'pages.untitled': (h) => `page ${h.page} of book ${h.vol}`,
    'pages.legacy': 'Kept in an earlier edition of the library — this address now holds a different page.',
    'pages.foundExact': 'Found as whole words',
    'pages.foundSubstring': 'Found inside other words',
    'pages.found': 'Found',
    'pages.random': 'Taken down at random.',
    'pages.byAddress': 'Opened by its address.',

    'colophon.after': 'after Jorge Luis Borges,',
    'colophon.private': 'Your pages stay in this browser.',

    'toast.undo': 'Undo',
    'toast.kept': 'Kept. It’s under Your pages.',
    'toast.takenOff': 'Taken off Your pages.',
    'toast.removed': 'Removed from Your pages.',
    'toast.linkCopied': 'Link copied. It opens this same page, for anyone.',
    'toast.addressCopied': (n) => `Address copied — ${n.toLocaleString('en')} digit${n === 1 ? '' : 's'}.`,
    'toast.copyFailed': 'This browser wouldn’t let us copy. The link in the address bar opens this same page.',
    'toast.copyInstead': 'Copy the link instead',
    'toast.imageSaved': 'Saved as an image.',
    'toast.imageFailed': 'This browser couldn’t make the image.',
    'toast.storage': (what) => `This browser wouldn’t let us ${what} — its storage is full or switched off.`,
    'storage.keep': 'keep the page',
    'storage.change': 'change your pages',
    'storage.putBack': 'put it back',
    'storage.undo': 'undo that',
    'storage.name': 'save the name',
    'notice.oldLink': 'This link was made for an earlier edition; the same address now holds a different page.',
    'notice.oldKept': 'You kept this in an earlier edition; the same address now holds a different page.',

    'book.aria': (vol, pages) => `Book ${vol}, ${pages.length === 2 ? `pages ${pages[0]} and ${pages[1]}` : `page ${pages[0]}`}`,
    'book.endpaper': 'Endpaper',
    'book.page': (n) => `Page ${n}`,
    'book.putBack': 'Put it back',
    'book.yourLine': (page, phrase) => `Your line: page ${page}, ${phrase}.`,
    'book.lineIsOn': (page) => `Your line is on page ${page} —`,
    'book.goBack': 'go back to it',
    'book.kept': 'Kept',
    'book.undo': 'undo',
    'book.undoAria': (page) => `Kept. Undo keeping page ${page}`,
    'book.keep': (page) => `Keep page ${page}`,
    'book.copyLink': 'Copy link',
    'book.copyAddress': 'Copy the address',
    'book.copyAddressShort': 'Copy address',
    'book.readLarge': 'Read it large',
    'book.readAll': 'Read it all',
    'book.keys': '← → to turn · ⇧← ⇧→ other results · S to keep · Esc to put it back',
    'book.keysPlain': '← → to turn · S to keep · Esc to put it back',
    'book.prevResult': '← previous',
    'book.nextResult': 'next →',
    'book.resultN': (n) => `result ${n.toLocaleString('en')}`,
    'book.glass': (a, b, c, d) => `Lines ${a}–${b} · characters ${c}–${d}`,
    'book.glassHint': 'Tap anywhere on the page to move the glass there.',
    'book.readerAria': 'The page, large',
    'book.readerBack': 'Back to the book',
    'book.howFar': 'How far is it?',
    'book.image': 'Save as image',
    'book.print': 'Print',
    'book.cardLine': (line) => `“${line}”`,
    'book.cardAddress': (shown, n) => `address ${shown} · ${n.toLocaleString('en')} digit${n === 1 ? '' : 's'}`,
    'book.printAddress': (n) => `The address of this page, in full — ${n.toLocaleString('en')} digit${n === 1 ? '' : 's'}. It is the page itself: keep it with the printout, and “Go to an address” will open it again.`,
    'layout.on.borges': 'as Borges wrote',
    'layout.on.dense': 'full walls',
    'far.figLabel': 'Fig. 2.',
    'far.figCaption.gallery': 'The shortest way here from hexagon 0, sketched: forward or back along the gallery, up or down the stairs. The legs are to scale with one another.',
    'far.figCaption.lattice': 'The shortest way here from hexagon 0, sketched: forward along the gallery, aslant through the doors, up or down the stairs. The legs are to scale with one another.',
    'far.figStretched': 'A leg marked ≈ is drawn longer than its share.',
    'far.figAria': 'Sketch of the shortest way from hexagon 0 to this hexagon',
    'far.figStart': 'hexagon 0',
    'far.figHere': 'here',
    'far.unitHex': (n) => (n === 1n ? 'hexagon' : 'hexagons'),
    'far.unitFloor': (n) => (n === 1n ? 'floor' : 'floors'),
    'far.unitMetre': 'metres',
  },

  hu: {
    title: 'A bábeli könyvtár',
    quote: (x) => `„${x}”`,
    'nav.aria': 'Részek',
    'nav.find': 'Egy sor keresése',
    'nav.address': 'Ugrás címre',
    'nav.pages': 'Lapjaid',
    'nav.about': 'A könyvtárról',
    'lang.aria': 'Nyelv',
    'theme.aria': 'Fény',
    'theme.light': 'Papír',
    'theme.dark': 'Lámpafény',
    'layout.aria': 'Polcok',
    'layout.borges': 'Borges szerint',
    'layout.dense': 'Telt falak',
    'layout.hint': 'Borges szerint: falanként 5 polc, polconként 32 könyv. Telt falak: padlótól mennyezetig polc, tele valós méretű könyvekkel. A lapok ugyanazok, csak a helyük más.',

    'walk.aria': 'Séta a könyvhöz',
    'walk.wait': 'Át a galériákon…',
    'walk.towards': 'Át a galériákon, úti cél:',
    'walk.hexagon': 'Hatszög:',
    'walk.skip': 'A séta kihagyása',
    'walk.dontWalk': 'Legközelebb séta nélkül',
    'walk.place': (h, step) => {
      const the = (w) => `${/^[aáeéiíoóöőuúüű]/.test(w) ? 'az' : 'a'} ${w}`;
      const parts = [`${the(huOrdinal(h.wall))} fal`, `${the(huOrdinal(h.shelf))} polc`, `${the(huOrdinal(h.vol))} könyv`];
      const text = parts.slice(0, step).join(' · ');
      return text.charAt(0).toUpperCase() + text.slice(1);
    },

    'find.lede': 'Minden 3200 karakteres lap ott áll már valamelyik polcon. Írj le egy sort, és a könyvtár megmondja, hol találod.',
    'find.label': 'Egy sor, egy név, bármi',
    'find.placeholder': 'pl. a felfoghatatlan középpont',
    'find.submit': 'Megkeresem a polcát',
    'find.ruleA': 'Huszonhat kisbetű, a szóköz és a',
    'find.ruleB': ' jelek. Az ékezetes betűből alapbetű lesz (á → a), minden más kimarad.',
    'find.willLook': 'A könyvtár ezt keresi:',
    'find.tooLong': 'Egy lapra 3200 karakter fér; a szövegedből csak az első 3200 kerül fel, a többi kimarad.',
    'find.empty': 'Előbb írj le egy sort — pár szót, egy nevet, bármit.',
    'find.nothingLeft': 'Nem maradt mit keresni: a könyvtárban csak a–z, a szóköz és a , . ? ! - jelek vannak.',
    'find.modes': 'Hogyan kerüljön a lapra',
    'find.exact': 'Önálló szavakként',
    'find.substring': 'Bárhol, akár más szavak belsejében',
    'random.lead': 'Vagy vegyél le egyet találomra:',
    'random.page': 'egy lapot',
    'random.book': 'egy könyvet, az elejétől',
    'random.address': 'vagy ugrás egy címre…',
    'last.label': 'Legutóbb itt olvastál',
    'last.random': 'egy találomra levett lap',
    'last.page': (h) => `${h.vol}. könyv, ${h.page}. oldal`,
    'last.back': 'Vissza oda →',
    'old.aria': 'Link egy korábbi kiadásból',
    'old.text': 'Ez a link a könyvtár egy korábbi kiadásához készült. A számozás azóta megváltozott, ugyanez a cím ma egy másik lapot nyit.',
    'old.open': 'Megnyitom így is',
    'old.restart': 'Kezdjük elölről',
    'fig.label': '1. ábra.',
    'fig.caption.borges': 'A galériák alaprajza. Minden hatszögnek négy polcos fala van, közepén légakna nagyon alacsony korláttal; a szabad oldalak keskeny, lépcsős folyosókra nyílnak, amelyek ugyanannak a galériának a következő hatszögébe vezetnek. Az egymás melletti galériák sosem érnek össze: egy hatszögből csak a saját galériája mentén vagy fel és le lehet továbbmenni. A tiédet pirossal jelöltük. A rajz a lap szélén véget ér. A könyvtár nem.',
    'fig.caption.dense': 'A galériák alaprajza. Minden hatszögnek négy polcos fala van, közepén légakna nagyon alacsony korláttal. Minden polcfal közepén keskeny, könyvekkel keretezett ajtó nyílik a szomszéd hatszögbe; a két szabad oldal a lépcsős folyosókra vezet. A tiédet pirossal jelöltük. A rajz a lap szélén véget ér. A könyvtár nem.',
    'fig.note': 'Borges huszonöt jelet számolt; ennek a könyvtárnak harminckettő kell.',
    'fig.aria.borges': 'A galériák alaprajza: minden irányban ismétlődő hatszögek, mindegyikben négy ép polcos fal a légakna körül és két folyosó a galéria mentén; a te hatszöged pirossal körberajzolva',
    'fig.aria.dense': 'A galériák alaprajza: minden irányban ismétlődő hatszögek, mindegyikben négy polcos fal a légakna körül, minden falban könyvekkel keretezett ajtó és két folyosó; a te hatszöged pirossal körberajzolva',

    'address.title': 'Ugrás címre',
    'address.ledeA': 'Minden lapnak pontosan egy címe van: egyetlen egész szám, 0-tól 32',
    'address.ledeB': ' − 1-ig. A leghosszabb 4817 jegyű, ezért inkább másold be, mint gépeld.',
    'address.label': 'A cím',
    'address.count': (n) => `${n.toLocaleString('hu')} jegy · egyetlen egész szám, semmi más`,
    'address.submit': 'Odamegyek',
    'address.skip': 'A könyv nyíljon ki rögtön, séta nélkül',
    'address.asideTitle': 'Honnan lesz cím?',
    'address.aside1': 'Bármelyik nyitott könyv alatt a „Cím másolása” adja meg a lap címét. A neked küldött link is ezt a számot tartalmazza, így ugyanazt a lapot nyitja meg — a teljes linket is bemásolhatod ide.',
    'address.aside2': 'A hatszög, a fal, a polc, a könyv és az oldal a számból olvasható ki; egyenként nem választhatók.',
    'address.aside3a': 'Vagy kezdd a semmiből:',
    'address.zero': 'a nullás cím',
    'address.aside3b': ', az első könyv első oldala.',
    'address.err.empty': 'Előbb illessz be vagy írj be egy címet — egyetlen egész számot, például 0-t.',
    'address.err.tooBig': 'Ez a szám túlfut az utolsó lapon. A legnagyobb cím 32^3200 − 1, ami 4817 jegyű.',
    'address.err.place': 'Ez a könyv helye, nem a címe. Nyitott könyv alatt a „Cím másolása” adja a teljes számot.',
    'address.err.notNumber': (shown) => `Ez nem cím. A cím egyetlen egész szám. Vedd ki belőle ezeket: ${shown}, és próbáld újra.`,
    'address.bad.space': 'szóköz',
    'address.bad.lines': 'sortörés',
    'address.bad.char': (c) => `„${c}”`,
    'address.bad.rest': 'a többi',

    'pages.title': 'Lapjaid',
    'pages.sub': 'Ebben a böngészőben tárolva, a legújabb elöl.',
    'pages.emptyTitle': 'Még nem tettél el semmit.',
    'pages.emptyText': 'Olvasás közben nyomd meg az S-t, vagy válaszd a könyv alatt a „Megtartom” lehetőséget. A lapjaid ebben a böngészőben maradnak, és sehol máshol.',
    'pages.findLink': 'Egy sor keresése →',
    'pages.aria': 'Megtartott lapok',
    'pages.name': 'Név',
    'pages.open': 'Megnyitás',
    'pages.done': 'Kész',
    'pages.rename': 'Átnevezés',
    'pages.remove': 'Törlés',
    'pages.openAria': (t) => `Megnyitás: ${t}`,
    'pages.renameAria': (t) => `Átnevezés: ${t}`,
    'pages.removeAria': (t) => `Törlés: ${t}`,
    'pages.foot': 'Egy lapot olvasás közben az S-sel vagy a könyv alatti „Megtartom” lehetőséggel tehetsz el.',
    'pages.untitled': (h) => `${h.vol}. könyv, ${h.page}. oldal`,
    'pages.legacy': 'A könyvtár egy korábbi kiadásában tetted el — ezen a címen ma egy másik lap áll.',
    'pages.foundExact': 'Megtalálva, önálló szavakként',
    'pages.foundSubstring': 'Megtalálva, más szavak belsejében',
    'pages.found': 'Megtalálva',
    'pages.random': 'Találomra levéve.',
    'pages.byAddress': 'Cím alapján megnyitva.',

    'colophon.after': 'Jorge Luis Borges novellája nyomán:',
    'colophon.private': 'A lapjaid ebben a böngészőben maradnak.',

    'toast.undo': 'Visszavonás',
    'toast.kept': 'Megtartva. A Lapjaid között megtalálod.',
    'toast.takenOff': 'Kivéve a Lapjaid közül.',
    'toast.removed': 'Törölve a Lapjaid közül.',
    'toast.linkCopied': 'A link a vágólapra került. Bárkinek ugyanezt a lapot nyitja meg.',
    'toast.addressCopied': (n) => `A cím a vágólapra került — ${n.toLocaleString('hu')} jegy.`,
    'toast.copyFailed': 'A böngésző nem engedte a másolást. A címsorban lévő link ugyanezt a lapot nyitja meg.',
    'toast.copyInstead': 'Inkább a linket másolom',
    'toast.imageSaved': 'Képként elmentve.',
    'toast.imageFailed': 'A böngésző nem tudta elkészíteni a képet.',
    'toast.storage': (what) => `A böngésző nem engedte, hogy ${what} — a tárhelye megtelt vagy ki van kapcsolva.`,
    'storage.keep': 'megtartsuk a lapot',
    'storage.change': 'módosítsuk a lapjaidat',
    'storage.putBack': 'visszategyük',
    'storage.undo': 'visszavonjuk',
    'storage.name': 'elmentsük a nevet',
    'notice.oldLink': 'Ez a link egy korábbi kiadáshoz készült; ugyanezen a címen ma egy másik lap áll.',
    'notice.oldKept': 'Ezt egy korábbi kiadásban tetted el; ugyanezen a címen ma egy másik lap áll.',

    'book.aria': (vol, pages) => `${vol}. könyv, ${pages.length === 2 ? `${pages[0]}–${pages[1]}. oldal` : `${pages[0]}. oldal`}`,
    'book.endpaper': 'Előzéklap',
    'book.page': (n) => `${n}. oldal`,
    'book.putBack': 'Vissza a polcra',
    'book.yourLine': (page, phrase) => `A sorod: ${page}. oldal, ${phrase}.`,
    'book.lineIsOn': (page) => `A sorod helye: ${page}. oldal —`,
    'book.goBack': 'vissza oda',
    'book.kept': 'Megtartva',
    'book.undo': 'visszavonás',
    'book.undoAria': (page) => `Megtartva. Visszavonás: ${page}. oldal`,
    'book.keep': (page) => `Megtartom: ${page}. oldal`,
    'book.copyLink': 'Link másolása',
    'book.copyAddress': 'Cím másolása',
    'book.copyAddressShort': 'Cím másolása',
    'book.readLarge': 'Felnagyítva olvasom',
    'book.readAll': 'Teljes lap',
    'book.keys': '← → lapozás · ⇧← ⇧→ további találatok · S megtartás · Esc vissza a polcra',
    'book.keysPlain': '← → lapozás · S megtartás · Esc vissza a polcra',
    'book.prevResult': '← előző',
    'book.nextResult': 'következő →',
    'book.resultN': (n) => `${n.toLocaleString('hu')}. találat`,
    'book.glass': (a, b, c, d) => `${a}–${b}. sor · ${c}–${d}. karakter`,
    'book.glassHint': 'Koppints a lapon bárhová, és a nagyító odaugrik.',
    'book.readerAria': 'A lap felnagyítva',
    'book.readerBack': 'Vissza a könyvhöz',
    'book.howFar': 'Milyen messze van?',
    'book.image': 'Mentés képként',
    'book.print': 'Nyomtatás',
    'book.cardLine': (line) => `„${line}”`,
    'book.cardAddress': (shown, n) => `cím: ${shown} · ${n} jegy`,
    'book.printAddress': (n) => `A lap teljes címe — ${n} jegy. Ez maga a lap: őrizd meg a nyomtatvánnyal együtt, és az „Ugrás címre” újra megnyitja.`,
    'layout.on.borges': 'Borges szerint',
    'layout.on.dense': 'telt falakkal',
    'far.figLabel': '2. ábra.',
    'far.figCaption.gallery': 'A legrövidebb út a 0. hatszögtől idáig, vázlatosan: előre vagy hátra a galéria mentén, fel vagy le a lépcsőn. A szakaszok hossza egymással arányos.',
    'far.figCaption.lattice': 'A legrövidebb út a 0. hatszögtől idáig, vázlatosan: előre a galéria mentén, ferdén az ajtókon át, fel vagy le a lépcsőn. A szakaszok hossza egymással arányos.',
    'far.figStretched': 'A ≈ jelű szakaszt az arányánál hosszabbra rajzoltuk.',
    'far.figAria': 'Vázlat a legrövidebb útról a 0. hatszögtől idáig',
    'far.figStart': '0. hatszög',
    'far.figHere': 'itt',
    'far.unitHex': () => 'hatszög',
    'far.unitFloor': () => 'emelet',
    'far.unitMetre': 'méter',
  },
};

/** Egy kulcs fordítása; függvény-értéknél a további argumentumokkal hívjuk. */
export function translate(lang, key, ...args) {
  const table = STRINGS[lang] ?? STRINGS.en;
  const value = key in table ? table[key] : STRINGS.en[key];
  if (value === undefined) return key;
  return typeof value === 'function' ? value(...args) : value;
}

export const LangContext = createContext('en');

export function useLang() {
  return useContext(LangContext);
}

export function useT() {
  const lang = useContext(LangContext);
  return useCallback((key, ...args) => translate(lang, key, ...args), [lang]);
}

/** A két nyelv kulcskészlete egyezzen — a teszt ezt ellenőrzi. */
export function missingKeys() {
  const en = Object.keys(STRINGS.en);
  const hu = Object.keys(STRINGS.hu);
  return { hu: en.filter((k) => !hu.includes(k)), en: hu.filter((k) => !en.includes(k)) };
}
