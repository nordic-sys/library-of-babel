import { useMemo } from 'react';
import { ALPHABET, LIBRARY_VERSION, M, N, getPageAddress, getPageText } from './core.js';
import { placeQuery } from './query.js';
import { STEP_S, bigNumber, hexCountLog, howFar, lastHexPages, libraryEdgeLog, log10Big } from './distance.js';
import { booksPerHex, booksPerWall, shelfRows, topology, useLayout } from './layout.js';
import { APOTHEM, BOOK, DOOR_W, FLOOR_H, HALL_L, HEX_R, HEX_STEP, SHAFT_R, SHELF_DEPTH, TOP_LEN } from './geometry.js';
import { useLang } from './i18n.js';

/**
 * „A könyvtárról”: miről szól, honnan ered, és hogyan számol ez a könyvtár — az algoritmusok
 * kifejtve és elemezve. A cikk két nyelven, külön szövegként áll (a mondatszerkezet nem fordítható
 * kulcsonként); a benne szereplő számokat a saját függvényeink számolják ki itt, így a leírás
 * nem csúszhat el a kódtól.
 */

/* Tizedes tört magyarul, tizedesvesszővel. */
const hu = (x, digits = 1) => x.toFixed(digits).replace('.', ',');

/* Szám: kiírva, vagy mantissza × 10 felső indexes kitevővel. */
function Big({ log, lang }) {
  const n = bigNumber(log, lang);
  if (n.plain) return n.plain;
  return <span className="far-num">{n.m}{' × '}10<sup>{n.e}</sup></span>;
}

function Formula({ children }) {
  return <pre className="about-formula">{children}</pre>;
}

/* Az élő értékek, egyszer kiszámolva. */
function useFacts(layout) {
  return useMemo(() => {
    const line = 'the unimaginable centre';
    const hit = placeQuery(line, 'exact');
    const page = getPageText(hit.address);
    const back = getPageAddress(page);
    const tlon = howFar(hit.address, layout);
    const cell = (Math.sqrt(3) / 2) * HEX_STEP ** 2;
    return {
      nDigits: N.toString().length,
      nLog: log10Big(N),
      booksLog: log10Big(N / 410n),
      // „A számok” fejezet Borges elrendezésében számol (ott még csak az szerepel); a távolság-példa a választott
      // elrendezésben.
      hexesLog: hexCountLog('borges'),
      pagesPerHex: booksPerHex('borges') * 410,
      lastBook: Number(N % 410n),
      lastHex: lastHexPages('borges'),
      // A két elrendezés egymás mellett (a „A tér” fejezethez).
      layouts: Object.fromEntries(['borges', 'dense'].map((id) => [id, {
        shelves: shelfRows(id).length,
        counts: [...new Set(shelfRows(id).map((r) => r.count))].sort((a, b) => b - a),
        perWall: booksPerWall(id),
        perHex: booksPerHex(id),
        edgeLog: libraryEdgeLog(id),
      }])),
      mHead: M.toString(16).slice(0, 16),
      zeroLine: getPageText(0n).slice(0, 80),
      line,
      hit,
      found: page.slice(hit.start, hit.start + hit.length),
      roundTrip: back === hit.address,
      addrDigits: hit.address.toString().length,
      route: tlon.route,
      walkYearsLog: tlon.walkYearsLog,
      lineMetresLog: tlon.lineMetresLog,
      edgeLog: libraryEdgeLog(layout),
      gallery: topology(layout) === 'gallery',
      density: booksPerHex('borges') / cell,
      denseDensity: booksPerHex('dense') / cell,
      stepS: STEP_S,
      pagesWithLineLog: (3200 - line.length) * Math.log10(32),
    };
  }, [layout]);
}

const SECTIONS = {
  hu: [
    ['idea', 'Miről szól'],
    ['origin', 'Az eredet'],
    ['numbers', 'A számok'],
    ['address', 'Címből lap, lapból cím'],
    ['search', 'A keresés'],
    ['place', 'A hely'],
    ['space', 'A tér'],
    ['distance', 'Milyen messze van?'],
    ['walk', 'A séta'],
    ['privacy', 'Ami nem hagyja el a gépet'],
    ['checks', 'Hogyan ellenőriztük'],
  ],
  en: [
    ['idea', 'What it is'],
    ['origin', 'Where it comes from'],
    ['numbers', 'The numbers'],
    ['address', 'From address to page, and back'],
    ['search', 'Finding a line'],
    ['place', 'The place'],
    ['space', 'The building'],
    ['distance', 'How far is it?'],
    ['walk', 'The walk'],
    ['privacy', 'What never leaves your computer'],
    ['checks', 'How we checked'],
  ],
};

function Hu({ f }) {
  const lang = 'hu';
  return (
    <>
      <section id="about-idea">
        <h2>Miről szól</h2>
        <p>
          Borges novellájában a világegyetem egy könyvtár: hatszögletű termek végtelennek tűnő sora, és
          a polcokon minden könyv megvan, amely egy rögzített ábécével, rögzített hosszban leírható.
          Szinte mind értelmetlen betűhalmaz — de valahol ott áll minden mondat, ami valaha elhangzott
          vagy elhangzik, minden könyv minden fordítása, és minden könyv minden hamis változata is.
        </p>
        <p>
          Itt ezt a könyvtárat építjük meg, kiszámítható módon. Minden lapnak címe van, és a cím
          egyértelműen meghatározza a lap szövegét — semmit nem tárolunk, minden lapot a címéből
          számolunk ki. Fordítva is működik: beírsz egy sort, és megmondjuk, melyik lapon áll, majd oda is
          sétálunk. A könyvtár nem véletlenszerű, hanem teljes: minden lehetséges lap pontosan egyszer
          szerepel benne.
        </p>
      </section>

      <section id="about-origin">
        <h2>Az eredet</h2>
        <p>
          Jorge Luis Borges argentin író <i>La biblioteca de Babel</i> című novellája 1941-ben jelent
          meg Buenos Airesben, <i>El jardín de senderos que se bifurcan</i> című kötetében; később a
          <i> Ficciones</i> (1944) része lett. Az elbeszélő egy idős könyvtáros, aki leírja a könyvtár
          rendjét és a könyvtárosok hitét, kétségbeesését és felekezeteit.
        </p>
        <p>
          Borges két évvel korábban esszét is írt az ötletről (<i>La biblioteca total</i>, Sur, 1939). Ebben a
          gondolat előzményeit az ókori atomistákig (Leukipposz, Démokritosz, Arisztotelész nyomán) és Ciceróig
          vezeti vissza; késői feltalálójának Gustav Theodor Fechnert, első kifejtőjének Kurd Lasswitz német
          írót nevezi (<i>Traumkristalle</i> című kötete alapján), a megvalósítás és a méretek kiszámítását
          pedig Theodor Wolffnak tulajdonítja. Lasswitz <i>Die Universalbibliothek</i> című elbeszélése (a
          20. század elejéről) valóban ki is számolja, mennyi könyv kellene. A gondolat azóta a
          matematika és az informatika kedvelt példája; a legismertebb digitális megvalósítása Jonathan
          Basile <i>libraryofbabel.info</i> webhelye (2015).
        </p>
        <p>A novella adatai, és hogy mit vettünk át belőlük:</p>
        <ul>
          <li>Egy könyv 410 oldal, egy oldal 40 sor, egy sor nagyjából 80 betű — <b>átvettük</b> (a sor
            nálunk pontosan 80 jel, így egy lap 3200 jel).</li>
          <li>Egy hatszögben négy polcos fal, falanként öt polc, polconként 32 könyv — <b>átvettük</b>:
            hatszögenként 640 könyv.</li>
          <li>25 jel: 22 betű, a szóköz, a pont és a vessző — <b>eltértünk</b>: 32 jelet használunk (az angol
            ábécé 26 betűje, a szóköz és <code>, . ? ! -</code>). Így egy jel pontosan 5 bit, és a lapok
            száma kettő hatványa, ami az alább leírt keverést egyszerűvé és megfordíthatóvá teszi.</li>
          <li>A szabad oldalak egyike keskeny folyosóra nyílik, amely egy másik, ugyanilyen galériába vezet; benne
            tükör, két kis fülke és csigalépcső; minden hatszögben két lámpa, keresztben elhelyezve — a folyosót, a tükröt, a
            lépcsőt és a lámpákat <b>átvettük</b> (a fülkéket a séta nem rajzolja ki). Nálunk a másik szabad oldalon az
            előző hatszög folyosója érkezik, így a galéria hatszögek láncává áll össze.</li>
          <li>Egy hatszögből csak a galéria mentén, folyosóról folyosóra, és a lépcsőn fel-le lehet
            továbbmenni; az egymás melletti galériák nem érnek össze — a „Borges szerint” elrendezésben{' '}
            <b>átvettük</b>: a könyvtár így egy függőleges sík (galéria × emeletek).</li>
          <li>A polcok a két szabad oldal kivételével minden oldalt borítanak, egy emelet magasak, és alig magasabbak
            egy átlagos könyvtárosnál — <b>eltértünk</b>. Valós méretű könyvekkel polconként 32 kötet nem tölt ki
            egy falat; ezért van két elrendezés (lent, „A tér”). A „Telt falak” elrendezésben ráadásul minden
            polcfalban ajtó nyílik a szomszéd hatszögbe — erről a novella nem szól, ez a mi kiegészítésünk, hogy a
            könyvtár minden irányban bejárható legyen.</li>
          <li>A könyvtár „határtalan és periodikus” — <b>átvettük</b> a lapozásban: az utolsó lap után a
            nullás cím következik.</li>
        </ul>
        <p>
          A novelláról bővebben a Wikipédián:{' '}
          <a href="https://hu.wikipedia.org/wiki/B%C3%A1beli_k%C3%B6nyvt%C3%A1r" lang="hu">magyarul</a>,{' '}
          <a href="https://en.wikipedia.org/wiki/The_Library_of_Babel" lang="en">angolul</a> és{' '}
          <a href="https://es.wikipedia.org/wiki/La_biblioteca_de_Babel" lang="es">spanyolul</a>. Magát a
          novellát nem közöljük és nem linkeljük, mert ma is szerzői jogi védelem alatt áll; nyomtatott
          kiadásban olvasható.
        </p>
      </section>

      <section id="about-numbers">
        <h2>A számok</h2>
        <p>
          Egy lapon 3200 hely van, mindegyiken 32 jel közül egy állhat, így a lehetséges lapok száma
        </p>
        <Formula>{'N = 32^3200 = 2^16000'}</Formula>
        <p>
          ami tízes számrendszerben {f.nDigits} jegyű szám, nagyjából <Big log={f.nLog} lang={lang} />. Ennyi
          lap <Big log={f.booksLog} lang={lang} /> könyvet és <Big log={f.hexesLog} lang={lang} /> hatszöget
          tölt meg. Az összevetés kedvéért: a megfigyelhető világegyetemben nagyjából 10<sup>80</sup> atom van.
        </p>
        <p>
          N nem osztható 410-zel, ezért a könyvtár legutolsó könyve nem teljes: {f.lastBook} oldala van. Az
          utolsó hatszög sem teljes: {f.lastHex.toLocaleString('hu')} lap áll benne, egy teljes hatszögben
          {` ${f.pagesPerHex.toLocaleString('hu')}`} van. A lapozó ezt jelzi is, és az utolsó lap után a nullás címre ugrik.
        </p>
      </section>

      <section id="about-address">
        <h2>Címből lap, lapból cím</h2>
        <p>
          A cím egy 0 és N − 1 közötti egész szám. A lapot három lépésben számoljuk ki belőle
          (<code>src/core.js</code>), 16 000 bites egészekkel (a böngésző <code>BigInt</code>-jével):
        </p>
        <Formula>{`v₁ = (cím · M + OFFSET)  mod 2^16000      affin keverés
v₂ = v₁ XOR (v₁ >> 8000)                 a felső fél rákeverése az alsóra
lap = v₂ 3200 darab 5 bites jegye, mindegyik egy jel az ábécéből`}</Formula>
        <p>
          Az ábécé sorrendje: <code>{ALPHABET.replace(/ /g, '␣')}</code>. A 0. jel az „a”, ezért a kis címek
          lapjain sok „a” állna — ezt akadályozza meg, hogy M és OFFSET maguk is teljes, 16 000
          bites számok: már a nullás cím lapja is végig kevert. A nullás cím első sora:
        </p>
        <Formula>{f.zeroLine}</Formula>
        <p><b>Miért megfordítható?</b> A keresés visszafelé számol, ezért minden lépésnek invertálhatónak kell lennie:</p>
        <ul>
          <li>A jegyekre bontás nyilvánvalóan az: 5 bit egy jel, 3200 jel 16 000 bit.</li>
          <li>Az eltolásos XOR a fél szélességgel önmaga inverze: a felső 8000 bit változatlan marad, az alsó
            felet pedig ugyanazzal a felső féllel kell még egyszer XOR-olni, hogy visszakapjuk.</li>
          <li>A szorzás M-mel modulo 2<sup>16000</sup> akkor és csak akkor invertálható, ha M páratlan —
            ezért állítjuk M legalsó bitjét 1-re. Az inverzet Newton–Hensel-iterációval számoljuk:
            <code> x ← x · (2 − M · x)</code>, ami minden lépésben megduplázza a helyes bitek számát, így
            körülbelül tizenkét lépés elég.</li>
        </ul>
        <p>
          A három lépés együtt bijekció a 0…N − 1 címek és az összes lehetséges lap között: minden lap
          pontosan egyszer szerepel, és két cím soha nem adja ugyanazt a lapot. Ettől „teljes” a könyvtár.
        </p>
        <p>
          <b>Az állandók.</b> M és OFFSET egy rögzített magból, SplitMix64 álvéletlen-generátorral készül
          (M eleje hexában: <code>{f.mHead}…</code>). Az első változat egy lineáris kongruenciális generátor
          alsó bitjeit használta, amelyeknek 16 a periódusa — emiatt a kis címek lapjai 64 jelenként
          ismételték magukat. A javítás megváltoztatta, melyik címen melyik lap áll, ezért a könyvtárnak
          kiadási száma van (most: {LIBRARY_VERSION}. kiadás), és a régi kiadású linkeket felismerjük.
        </p>
        <p>
          <b>Mire nem való ez a keverés?</b> Nem kriptográfiai permutáció. A lapok véletlenszerű kinézetét a
          teljes szélességű, álvéletlen M és OFFSET adja. A szorzás viszont csak felfelé terjeszti a változást a
          bitekben: a szorzat alsó bitjei csak a cím alsó bitjeitől függenek. Az XOR-lépés ezért kell — ez hajtja
          le a felső felet az alsóra, hogy a lap vége is függjön a cím felső bitjeitől. A szerkezet így is
          látszik: két cím, amely csak a legfelső bitben tér el (2<sup>15999</sup> a különbség), mindössze két
          jelben ad eltérő lapot. Szemre és egyszerű statisztikai próbákkal a lapok egyenletes véletlen szövegnek
          tűnnek, de aki ismeri M-et, látja a szerkezetet. Egy könyvtárhoz ennyi elég: a cél a teljesség és a megfordíthatóság, nem a titkosság.
        </p>
      </section>

      <section id="about-search">
        <h2>A keresés</h2>
        <p>
          A beírt sort előbb átírjuk a könyvtár ábécéjére (<code>src/query.js</code>): kisbetűsítjük, az
          ékezeteket Unicode-felbontással (NFD) leválasztjuk (á → a, ő → o), és ami ezután sincs a 32 jel
          között — számjegy, idézőjel, sortörés —, kimarad. Gépelés közben megmondjuk, mi lett a sorból.
        </p>
        <p>
          Egy rövid sor csillagászati számú lapon szerepel: egy {f.line.length} jelű sor egy adott helyen{' '}
          <Big log={f.pagesWithLineLog} lang={lang} /> lapon áll. Ezek közül egyet választunk,
          determinisztikusan, hogy ugyanaz a keresés mindig ugyanoda vigyen (és a linkek ne romoljanak el):
        </p>
        <ol>
          <li>A sorból és a módból (önálló szavakként / bárhol) — a további találatoknál a sorszámmal is — FNV-1a hash-sel
            magot képzünk, abból xorshift32 álvéletlen-sorozatot. Így a „következő találat” egy másik, ugyanígy
            kiszámolt lap; az első találat magja a régi, ezért a régi linkek nem változnak.</li>
          <li>A sorozatból kitöltünk egy 3200 jeles lapot, és kiválasztunk egy kezdőhelyet.</li>
          <li>„Önálló szavakként” módban a sor elé és mögé szóköz vagy írásjel kerül, hogy ne egy hosszabb szó
            belsejében álljon.</li>
          <li>A sort a kezdőhelyre írjuk, és a kész lapból visszafelé kiszámoljuk a címet.</li>
        </ol>
        <p>
          Próba itt és most, a böngésződben: a „{f.line}” sor egy {f.addrDigits} jegyű címre került (kezdőhelye:
          {` ${f.hit.start + 1}.`} jel). Ha a cím lapját újra kiszámoljuk, ez áll ott: „{f.found}”
          {f.roundTrip ? ' — és a lapból visszaszámolt cím ugyanaz. ✓' : ' — a visszaszámolt cím eltér!'}
        </p>
      </section>

      <section id="about-place">
        <h2>A hely</h2>
        <p>
          A címből vegyes alapú számrendszerrel kapjuk meg a helyet (<code>src/location.js</code>), a
          legkisebb egységtől felfelé:
        </p>
        <Formula>{`oldal  = cím mod 410            (1–410)
könyv  = ⌊cím / 410⌋ mod 32     (1–32)
polc   = ⌊… / 32⌋ mod 5         (1–5)
fal    = ⌊… / 5⌋ mod 4          (1–4)
hatszög = ⌊… / 4⌋               a hatszög sorszáma, harminchatos számrendszerben írva`}</Formula>
        <p>
          Egy hatszögben így 4 · 5 · 32 · 410 = 262 400 lap áll. Ez Borges elrendezése; a „Telt falak”
          elrendezésben (a lábléc kapcsolója) falanként {f.layouts.dense.shelves} polc van, polconként
          {` ${f.layouts.dense.counts.join(' vagy ')}`} könyvvel; ilyenkor a polc és a könyv sorszámát a polcsorok
          könyvszámainak összegéből számoljuk. A lapok és a címek ugyanazok, csak a hely más. Nyitott könyvben a bal oldal mindig
          páros, a jobb páratlan, mint egy nyomtatott könyvben; kétoldalas nézetben egyszerre két oldalt lapozunk.
        </p>
      </section>

      <section id="about-space">
        <h2>A tér</h2>
        <p>
          A novella nem mondja meg, mekkora egy hatszög, mekkora a légakna és milyen vastag egy könyv; a
          hatszögeket csak a folyosó és a lépcső köti össze. Ezeket nekünk kellett eldöntenünk, számolással
          (<code>src/geometry.js</code>):
        </p>
        <ul>
          <li><b>A hatszög méretét a légakna szabja meg, nem a könyvek.</b> Az akna sugara {hu(SHAFT_R)} m, körülötte
            egyméteres járógyűrű és {Math.round(SHELF_DEPTH * 100)} cm mély polc: ebből {hu(APOTHEM, 2)} m apotéma,
            {` ${hu(HEX_R)}`} m-es fal jön ki.</li>
          <li><b>Valós méretű könyvek.</b> A 410 oldal 205 levél; 60–100 g/m²-es papíron, kötéssel együtt egy ilyen
            könyv 2–3,5 cm vastag, a 40 sor × 80 jel pedig 10–11 pontos betűvel kb. 17 × 24 cm-es lapot ad. Mi
            {` ${hu(BOOK.w * 100)}`} cm-rel számolunk: egy polcnyi 32 könyv így {hu(32 * BOOK.w, 2)} m.</li>
          <li><b>Borges szerint: ép polcfal, és csak annyi polc, amennyi a könyveknek kell.</b> A fal közepén egy {hu(TOP_LEN, 2)} m
            széles, 5 polcos, kb. 2 m magas szekrény, polconként 32 kötettel; a {hu(HEX_R)} m-es fal többi része
            csupasz — 32 valós könyv nem tölt ki egy falat, a fal hosszát ugyanis a légakna szabja meg.</li>
          <li><b>Telt falak: ajtó minden polcfalban.</b> A fal közepén {DOOR_W * 100} cm-es ajtó, körülötte padlótól
            mennyezetig polc, tele egész könyvekkel. Szabályos rácsban minden hatszög egyforma, ezért ha egyetlen
            falba ajtó kell, mindegyikbe kell — az „ajtó csak minden harmadik hatszögben” sem takarított volna meg helyet.</li>
          <li><b>Az eredmény</b>: két szomszédos hatszög középpontja {hu(HEX_STEP, 2)} m-re van ({hu(HALL_L)} m-es
            folyosóval vagy átjáróval), egy emelet magassága {hu(FLOOR_H)} m. Borges elrendezésében ez {hu(f.density)} könyv
            négyzetméterenként, telt falakkal {hu(f.denseDensity)}.</li>
          <li>Borges szerint egy hatszögnek két szomszédja van, a galéria mentén; telt falakkal hat: kettő folyosón át a
            galéria mentén, négy ajtón át, ferdén előre és hátra. Emeletet mindkét esetben csak folyosóban lehet váltani,
            mert csigalépcső csak ott van.</li>
        </ul>
        <p>
          <b>Két elrendezés.</b> Borges szerint falanként {f.layouts.borges.shelves} polc, polconként 32 könyv:
          hatszögenként {f.layouts.borges.perHex} könyv, és valós méretű kötetekkel a fal nagy része csupasz. A „Telt
          falak” elrendezésben a fal padlótól mennyezetig polc ({f.layouts.dense.shelves} polc, a könyvek fölött kb. 5 cm
          hellyel), a polcok tele egész könyvekkel: falanként {f.layouts.dense.perWall.toLocaleString('hu')}, hatszögenként
          {` ${f.layouts.dense.perHex.toLocaleString('hu')}`} könyv. Ugyanannyi lap így kevesebb hatszögben fér el, ezért a
          könyvtár kisebb: <Big log={f.layouts.dense.edgeLog} lang={lang} /> hatszög egy irányban
          (<Big log={f.layouts.borges.edgeLog} lang={lang} /> helyett).
        </p>
        <p>A nyitólap 1. ábrája ezekkel a méretekkel készült.</p>
      </section>

      <section id="about-distance">
        <h2>Milyen messze van?</h2>
        <p>
          A két elrendezés kétféle teret ad. <b>Borges szerint</b> csak a galéria mentén és a lépcsőn lehet menni: a
          hatszögeket a galéria × emeletek síkjában, négyzetes spirálban számozzuk, így n hatszög √n élű négyzetben
          áll, és a legrövidebb út egyszerűen a galéria menti lépések és az emeletek összege (ha az út nem halad át
          folyosón, egy lépés kitérővel). <b>Telt falakkal</b> az ajtók miatt a tér háromdimenziós; erről szól a
          fejezet többi része.
        </p>
        <p>
          A címekhez helyet kell rendelni a térben. A hatszögeket a 0. hatszögtől <b>héjanként</b> számozzuk
          kifelé: a k. héj azoknak a helyeknek az összessége, ahol a három koordináta (előre, oldalra, fel) közül a
          legnagyobb abszolút értéke k. Így az első n hatszög egy nagyjából ∛n élű tömbben áll, és a
          héjat egész köbgyökkel számoljuk ki (Newton-iterációval, 4800 jegyű számokon is pontosan):
        </p>
        <Formula>{`k = ⌊(⌊∛n⌋ + 1) / 2⌋        a héj, amelyben az n. hatszög áll
(2k − 1)³ ≤ n < (2k + 1)³`}</Formula>
        <p>
          <b>A legrövidebb út</b> zárt alakban számolható, mert a rács szabályos. A szinten a hatszögtávolság
          a lépések száma (axiális koordinátákban, 120°-os tengelyekkel):
        </p>
        <Formula>{`lépések = max(|q|, |r|)     ha q és r előjele azonos (egy átlós lépés mindkét irányban halad)
          = |q| + |r|          különben
idő = lépések · ${hu(f.stepS, 2)} s + emeletek · 15 s
      (+ egy lépés, ha emeletet kell váltani, de az út nem halad át folyosón)`}</Formula>
        <p>
          Az utolsó tag a lépcső miatt kell: ha emeletet kell váltani, de egyik legrövidebb út sem vezet
          folyosón át, ki kell lépni egy folyosóra, és vissza. A képletet valódi útkereséssel ellenőriztük:
          Dijkstra-algoritmus a teljes gráfon, hatszög- és folyosó-csomópontokkal, lépcsővel csak a
          folyosókban. A projekt tesztje ezernél több pontpárt vet össze, eltérés nélkül; a galériás (Borges szerinti)
          utat ugyanígy, szélességi kereséssel.
        </p>
        <p>
          A fenti „{f.line}” sor hatszöge például ilyen messze van (a választott elrendezésben): a legrövidebb úton
          gyalog <Big log={f.walkYearsLog} lang={lang} /> évig tartana. Ha minden hatszög egyetlen egyenes galériában
          állna, ez a hatszög <Big log={f.lineMetresLog} lang={lang} /> méterre volna —{' '}
          {f.gallery
            ? <>a kitevő a kétszerese, mert a tér két irányban terjed. Az egész könyvtár <Big log={f.edgeLog} lang={lang} /> hatszög hosszú és ugyanannyi emelet magas.</>
            : <>a kitevő a háromszorosa, mert a tér három irányban terjed. Az egész könyvtár <Big log={f.edgeLog} lang={lang} /> hatszög hosszú, széles és magas.</>}
        </p>
      </section>

      <section id="about-walk">
        <h2>A séta</h2>
        <p>
          A keresés után egy rövid, kb. tizenegy másodperces sétában odamegyünk a polchoz
          (<code>src/walk/</code>, React Three Fiber). Két hatszöggel arrébb, egy emelettel feljebb indulunk,
          lemegyünk a csigalépcsőn, elhaladunk a folyosó tükre előtt, megkerüljük a légaknát, és megállunk a polc
          előtt; a kötet kicsúszik a polcról, és kinyílik.
        </p>
        <ul>
          <li><b>Rézkarcstílus.</b> Saját árnyaló: a felületeket világkoordinátás sraffozás rajzolja, a
            fényerőtől függő sűrűséggel; Lámpafénynél ugyanez karcrajzként, a vonalak a fényt rajzolják.</li>
          <li><b>Fények.</b> Minden pontot a legközelebbi hatszög két lámpája világít meg: az árnyaló a pont
            koordinátáit a hatszögrács tengelyeire bontja és kockakoordinátás kerekítéssel megkeresi a legközelebbi
            középpontot — a szomszéd galériákban is.</li>
          <li><b>Mozgás.</b> Az út egyetlen görbe, a séta a hosszától függetlenül 8,6 másodperc alatt
            ér a polchoz (a sebesség ehhez igazodik: gyorsítás, egyenletes menet, lassítás). Útközben a kamera szemmagasságban néz, lefelé
            legfeljebb 10°-ot, csak a lépcsőn; a végén a polchoz hajol: az alsó polcokhoz leguggol, a magasakhoz
            felnéz.</li>
          <li><b>Teljesítmény.</b> Minden ismétlődő elem — könyvek, polcok, falak, lépcsőfokok — példányosítva
            rajzolódik; gyengébb gépen kevesebb emelet látszik.</li>
          <li><b>Kihagyható.</b> Esc vagy egy gomb; ha a rendszerben be van kapcsolva a „csökkentett mozgás”, nincs séta; a three.js csak
            annak töltődik le, aki sétál.</li>
        </ul>
      </section>

      <section id="about-privacy">
        <h2>Ami nem hagyja el a gépet</h2>
        <p>
          Minden számítás a böngésződben történik; az oldal mögött nincs saját szerver, nincs fiók, süti, analitika
          vagy követés. A megtartott lapjaid, az utoljára olvasott lap, a nyelv, a téma, az elrendezés és a
          „Legközelebb séta nélkül” beállítás a böngésző helyi tárolójában maradnak, és sehová nem kerülnek. Az
          oldalt a GitHub Pages szolgálja ki: mint minden webhely kiszolgálója, a GitHub is látja a letöltést (például
          az IP-címet) — ezen túl senki. A betűkészleteket is innen töltjük, nem külső betűszolgáltatótól.
        </p>
      </section>

      <section id="about-checks">
        <h2>Hogyan ellenőriztük</h2>
        <p>
          A cím ↔ lap leképezést oda-vissza teszt ellenőrzi (<code>core.test.mjs</code>); a helyet, a lapozást, a keresés leírását, a
          nyelveket, az elrendezéseket és a távolságot nagyjából száz további ellenőrzés vizsgálja
          (<code>location.test.mjs</code>). A tervezési döntések a projekt <code>docs/DESIGN.md</code> dokumentumában
          vannak.
        </p>
      </section>
    </>
  );
}

function En({ f }) {
  const lang = 'en';
  return (
    <>
      <section id="about-idea">
        <h2>What it is</h2>
        <p>
          In Borges’s story the universe is a library: an apparently endless run of hexagonal rooms whose
          shelves hold every book that can be written with a fixed alphabet at a fixed length. Nearly all
          of them are gibberish — but somewhere among them stands every sentence ever said or yet to be said,
          every translation of every book, and every false version of every book too.
        </p>
        <p>
          This site builds that library, computably. Every page has an address, and the address determines
          the page’s text exactly — nothing is stored; every page is calculated from its address. It works
          the other way too: write a line, and the library tells you which page it stands on, and walks you
          there. The library is not random but complete: every possible page appears exactly once.
        </p>
      </section>

      <section id="about-origin">
        <h2>Where it comes from</h2>
        <p>
          Jorge Luis Borges’s story <i>La biblioteca de Babel</i> appeared in Buenos Aires in 1941, in the
          collection <i>El jardín de senderos que se bifurcan</i>; it later became part of <i>Ficciones</i> (1944).
          The narrator is an old librarian describing the order of the library and the faith, despair and
          sects of its librarians.
        </p>
        <p>
          Two years earlier Borges had written an essay on the idea (<i>La biblioteca total</i>, Sur, 1939),
          tracing it back to the atomists of antiquity (Leucippus and Democritus, by way of Aristotle) and to Cicero;
          he calls Gustav Theodor Fechner its belated inventor and the German writer Kurd Lasswitz its first
          exponent (by way of his book <i>Traumkristalle</i>), and credits Theodor Wolff with working out its
          execution and dimensions. Lasswitz’s story <i>Die Universalbibliothek</i> (from the first years of the
          century) does indeed work out how many books would be needed. The idea has since become a favourite example in mathematics and
          computing; its best-known digital form is Jonathan Basile’s <i>libraryofbabel.info</i> (2015).
        </p>
        <p>What the story specifies, and what we kept:</p>
        <ul>
          <li>A book has 410 pages, a page 40 lines, a line about 80 letters — <b>kept</b> (here a line is
            exactly 80 characters, so a page is 3,200).</li>
          <li>A hexagon has four walls of shelves, five shelves to a wall, 32 books to a shelf — <b>kept</b>:
            640 books to a hexagon.</li>
          <li>25 symbols: 22 letters, the space, the full stop and the comma — <b>changed</b>: we use 32 (the 26
            letters of the English alphabet, the space and <code>, . ? ! -</code>). A symbol is then exactly
            5 bits, and the number of pages is a power of two, which makes the mixing described below simple
            and reversible.</li>
          <li>One of the free sides opens onto a narrow hallway leading to another, identical gallery, with a mirror,
            two small closets and a spiral stair; each hexagon has two lamps, set crosswise — the hallway, the mirror, the
            stair and the lamps are <b>kept</b> (the walk does not draw the closets). Here the previous hexagon’s hallway
            arrives at the other free side, so the gallery is a chain.</li>
          <li>From a hexagon one goes on only along the gallery, hallway after hallway, and up or down the stairs;
            galleries side by side never meet — <b>kept</b> in the “As Borges wrote” arrangement: the library is then a
            vertical plane (gallery × floors).</li>
          <li>The shelves cover every side but two, are as high as the floor and barely taller than an average
            librarian — <b>changed</b>. With books of real size, 32 to a shelf cannot fill a wall; hence two
            arrangements (below, “The building”). With “Full walls”, moreover, every shelf wall has a door into the
            next hexagon — the story does not mention it; it is our addition, so that the library can be walked in
            every direction.</li>
          <li>The library is “unlimited and periodic” — <b>kept</b> in turning the pages: after the last page
            comes address 0.</li>
        </ul>
        <p>
          More about the story on Wikipedia:{' '}
          <a href="https://en.wikipedia.org/wiki/The_Library_of_Babel" lang="en">in English</a>,{' '}
          <a href="https://es.wikipedia.org/wiki/La_biblioteca_de_Babel" lang="es">in Spanish</a> and{' '}
          <a href="https://hu.wikipedia.org/wiki/B%C3%A1beli_k%C3%B6nyvt%C3%A1r" lang="hu">in Hungarian</a>.
          The story itself is not reproduced or linked here, as it is still under copyright; it can be read
          in print.
        </p>
      </section>

      <section id="about-numbers">
        <h2>The numbers</h2>
        <p>A page has 3,200 places, each holding one of 32 symbols, so the number of possible pages is</p>
        <Formula>{'N = 32^3200 = 2^16000'}</Formula>
        <p>
          — a number of {f.nDigits.toLocaleString('en')} decimal digits, about <Big log={f.nLog} lang={lang} />.
          That many pages fill <Big log={f.booksLog} lang={lang} /> books and <Big log={f.hexesLog} lang={lang} /> hexagons.
          For comparison, the observable universe holds roughly 10<sup>80</sup> atoms.
        </p>
        <p>
          N is not divisible by 410, so the very last book of the library is incomplete: it has {f.lastBook} pages.
          The last hexagon is not full either: it holds {f.lastHex.toLocaleString('en')} pages of
          {` ${f.pagesPerHex.toLocaleString('en')}`}. Turning the pages says so, and after the last page comes address 0.
        </p>
      </section>

      <section id="about-address">
        <h2>From address to page, and back</h2>
        <p>
          An address is a whole number from 0 to N − 1. The page is computed from it in three steps
          (<code>src/core.js</code>), with 16,000-bit integers (the browser’s <code>BigInt</code>):
        </p>
        <Formula>{`v₁ = (address · M + OFFSET)  mod 2^16000    affine mixing
v₂ = v₁ XOR (v₁ >> 8000)                   fold the upper half onto the lower
page = the 3,200 five-bit digits of v₂, each one symbol of the alphabet`}</Formula>
        <p>
          The alphabet, in order: <code>{ALPHABET.replace(/ /g, '␣')}</code>. Symbol 0 is “a”, so very small
          numbers would begin with long runs of “a” — which is why M and OFFSET are themselves full 16,000-bit
          numbers: even the page at address 0 is mixed throughout. Its first line:
        </p>
        <Formula>{f.zeroLine}</Formula>
        <p><b>Why it can be reversed.</b> Finding a line computes backwards, so every step must be invertible:</p>
        <ul>
          <li>Splitting into digits obviously is: 5 bits a symbol, 3,200 symbols, 16,000 bits.</li>
          <li>The shift-XOR by half the width is its own inverse: the upper 8,000 bits are unchanged, and
            XOR-ing the lower half with the same upper half once more restores it.</li>
          <li>Multiplying by M modulo 2<sup>16000</sup> is invertible exactly when M is odd — hence M’s last bit
            is set to 1. The inverse is found by Newton–Hensel iteration, <code>x ← x · (2 − M · x)</code>,
            which doubles the number of correct bits at every step, so about twelve steps suffice.</li>
        </ul>
        <p>
          Together the three steps are a bijection between the addresses 0…N − 1 and all possible pages: every
          page appears exactly once, and no two addresses give the same page. That is what makes the library
          complete.
        </p>
        <p>
          <b>The constants.</b> M and OFFSET are generated from fixed seeds with the SplitMix64 generator (M
          begins, in hex, <code>{f.mHead}…</code>). The first version used the low bits of a linear congruential
          generator, whose period is 16 — so the pages of small addresses repeated every 64 characters. Fixing
          it changed which page stands at which address, so the library has an edition number (now edition
          {` ${LIBRARY_VERSION}`}), and links from the old edition are recognised.
        </p>
        <p>
          <b>What this mixing does not claim.</b> It is not a cryptographic permutation. The random look of the pages
          comes from the full-width pseudo-random M and OFFSET. Multiplication, though, only carries a change upwards
          through the bits: the low bits of the product depend only on the low bits of the address. That is why the
          XOR step is there — it folds the upper half down, so the end of the page depends on the high bits too.
          The structure still shows: two addresses differing only in the top bit (2<sup>15999</sup> apart) give pages
          that differ in just two characters. To the eye and to simple statistics the pages look like uniformly
          random text, but anyone who knows M can see the structure. For a library that is enough: the aim is completeness and reversibility, not secrecy.
        </p>
      </section>

      <section id="about-search">
        <h2>Finding a line</h2>
        <p>
          Your line is first brought into the library’s alphabet (<code>src/query.js</code>): lowered, its
          accents split off by Unicode decomposition (NFD: á → a, ő → o), and whatever is still not among the 32
          symbols — digits, quotation marks, line breaks — is left out. While you type, we tell you what became
          of it.
        </p>
        <p>
          A short line stands on an astronomical number of pages: a line of {f.line.length} characters, at a given
          place, stands on <Big log={f.pagesWithLineLog} lang={lang} /> pages. We choose one of them,
          deterministically, so that the same search always leads to the same page (and links never break):
        </p>
        <ol>
          <li>The line and the mode (whole words / anywhere) — and, for later results, their number — are hashed with
            FNV-1a into a seed for an xorshift32 pseudo-random sequence. “Next result” is thus another page computed
            the same way; the first result keeps the original seed, so old links do not change.</li>
          <li>The sequence fills a 3,200-character page and chooses a starting place.</li>
          <li>In “whole words” mode a space or punctuation mark goes before and after the line, so it does not
            stand inside a longer word.</li>
          <li>The line is written at its place, and the address is computed backwards from the finished page.</li>
        </ol>
        <p>
          A trial, now, in your browser: the line “{f.line}” went to an address of {f.addrDigits.toLocaleString('en')} digits,
          from character {f.hit.start + 1}. Computing that address’s page again, this stands there: “{f.found}”
          {f.roundTrip ? ' — and the address computed back from the page is the same. ✓' : ' — the address computed back differs!'}
        </p>
      </section>

      <section id="about-place">
        <h2>The place</h2>
        <p>
          An address is split into a place in a mixed-radix system (<code>src/location.js</code>), from the
          smallest unit up:
        </p>
        <Formula>{`page    = address mod 410        (1–410)
book    = ⌊address / 410⌋ mod 32  (1–32)
shelf   = ⌊… / 32⌋ mod 5          (1–5)
wall    = ⌊… / 5⌋ mod 4           (1–4)
hexagon = ⌊… / 4⌋                 the hexagon’s number, written in base 36`}</Formula>
        <p>
          A hexagon thus holds 4 · 5 · 32 · 410 = 262,400 pages. That is Borges’s arrangement; with “Full walls”
          (the switch in the footer) a wall has {f.layouts.dense.shelves} shelves of {f.layouts.dense.counts.join(' or ')} books,
          and the shelf and book are found from the running sums of the rows. The pages and the addresses are the
          same; only the place differs. In the open book the left page is always even and
          the right one odd, as in a printed book; in the two-page view each turn moves two pages.
        </p>
      </section>

      <section id="about-space">
        <h2>The building</h2>
        <p>
          The story does not say how large a hexagon is, how wide the airshaft, or how thick a book; only the
          hallway and the stair connect the hexagons. We had to decide these, by calculation
          (<code>src/geometry.js</code>):
        </p>
        <ul>
          <li><b>The airshaft sets the size of a hexagon, not the books.</b> The shaft has a radius of {SHAFT_R} m,
            around it a one-metre walk and {Math.round(SHELF_DEPTH * 100)} cm deep shelves: an apothem of {APOTHEM.toFixed(2)} m,
            walls {HEX_R} m long.</li>
          <li><b>Books of real size.</b> 410 pages are 205 leaves; on 60–100 g/m² paper, bound, such a book is 2–3.5 cm
            thick, and 40 lines of 80 characters in 10–11 point type make a page of about 17 × 24 cm. We take
            {` ${(BOOK.w * 100).toFixed(1)}`} cm, so a shelf of 32 books is {(32 * BOOK.w).toFixed(2)} m.</li>
          <li><b>As Borges wrote: unbroken shelf walls, and only as much shelf as there are books.</b> In the middle of
            the wall a bookcase {TOP_LEN.toFixed(2)} m wide, five shelves of 32, about 2 m high; the rest of the {HEX_R} m wall
            is bare — 32 real books do not fill a wall whose length the airshaft sets.</li>
          <li><b>Full walls: a door in every shelf wall.</b> A {DOOR_W * 100} cm door in the middle of the wall, shelves
            from floor to ceiling around it, full of whole books. In a regular lattice every hexagon is the same, so
            if one wall needs a door, every one does — “a door only in every third room” would have saved no space.</li>
          <li><b>The result:</b> neighbouring hexagons are {HEX_STEP.toFixed(2)} m apart, centre to centre (through a
            {` ${HALL_L}`} m hallway or passage), a floor is {FLOOR_H} m. As Borges wrote, that is {f.density.toFixed(1)} books
            per square metre; with full walls, {f.denseDensity.toFixed(1)}.</li>
          <li>As Borges wrote, a hexagon has two neighbours, along the gallery; with full walls it has six: two through
            the hallways along the gallery, four through the doors, aslant ahead and behind. Either way, floors can only
            be changed in a hallway, the only place with a spiral stair.</li>
        </ul>
        <p>
          <b>Two arrangements.</b> As Borges wrote, {f.layouts.borges.shelves} shelves to a wall and 32 books to a shelf:
          {` ${f.layouts.borges.perHex}`} books to a hexagon, and with books of real size most of each wall is bare. With
          “Full walls” the shelves run from floor to ceiling ({f.layouts.dense.shelves} rows, about 5 cm of room above the
          books), full of whole books: {f.layouts.dense.perWall.toLocaleString('en')} to a wall,
          {` ${f.layouts.dense.perHex.toLocaleString('en')}`} to a hexagon. The same pages then fit into fewer hexagons, so
          the library is smaller: <Big log={f.layouts.dense.edgeLog} lang={lang} /> hexagons in each direction instead
          of <Big log={f.layouts.borges.edgeLog} lang={lang} />.
        </p>
        <p>Fig. 1 on the first page is drawn from these dimensions.</p>
      </section>

      <section id="about-distance">
        <h2>How far is it?</h2>
        <p>
          The two arrangements make two spaces. <b>As Borges wrote</b>, one can go only along the gallery and up or down
          the stairs: the hexagons are numbered in a square spiral over gallery × floors, so n hexagons fill a square √n
          on a side, and the shortest way is simply the steps along the gallery plus the floors (with one step’s detour
          if the way passes no hallway). <b>With full walls</b> the doors make the space three-dimensional; the rest of
          this section is about that.
        </p>
        <p>
          Addresses need places in space. We number the hexagons outward from hexagon 0 <b>shell by shell</b>:
          shell k is the set of places where the largest of the three coordinates (ahead, aside, floor) has
          absolute value k. The first n hexagons then fill a block about ∛n on a side, and the shell is found with
          an integer cube root (Newton’s iteration, exact even on 4,800-digit numbers):
        </p>
        <Formula>{`k = ⌊(⌊∛n⌋ + 1) / 2⌋        the shell holding hexagon n
(2k − 1)³ ≤ n < (2k + 1)³`}</Formula>
        <p>
          <b>The shortest way</b> has a closed form, because the lattice is regular. On a floor, the number of
          steps is the hexagon distance (in axial coordinates with axes 120° apart):
        </p>
        <Formula>{`steps = max(|q|, |r|)     if q and r have the same sign (one diagonal step covers both)
      = |q| + |r|          otherwise
time  = steps · ${f.stepS.toFixed(2)} s + floors · 15 s
      (+ one step if a floor must be changed but the way passes no hallway)`}</Formula>
        <p>
          The last term is the stairs: if a floor must be changed but no shortest way passes through a hallway,
          one has to step out into a hallway and back. The formula was checked against a real search: Dijkstra’s
          algorithm on the full graph, with hexagon and hallway nodes and stairs only in the hallways. The project’s
          test compares over a thousand pairs without a single difference, and the gallery (as Borges wrote) route the
          same way, with a breadth-first search.
        </p>
        <p>
          The hexagon of the line “{f.line}” above, for instance, is this far (in the chosen arrangement): the
          shortest way takes <Big log={f.walkYearsLog} lang={lang} /> years on foot. Were every hexagon in one straight
          gallery it would be <Big log={f.lineMetresLog} lang={lang} /> metres —{' '}
          {f.gallery
            ? <>twice the exponent, because space extends in two directions. The whole library is <Big log={f.edgeLog} lang={lang} /> hexagons long and as many floors high.</>
            : <>three times the exponent, because space extends in three directions. The whole library is <Big log={f.edgeLog} lang={lang} /> hexagons long, wide and high.</>}
        </p>
      </section>

      <section id="about-walk">
        <h2>The walk</h2>
        <p>
          After a search, a short walk of about eleven seconds takes you to the shelf (<code>src/walk/</code>, React
          Three Fiber). It starts two hexagons away and one floor up, goes down the spiral stair, passes the
          hallway mirror, circles the airshaft and stops at the shelf; the book slides out and opens.
        </p>
        <ul>
          <li><b>Engraving.</b> A shader of our own draws every surface with hatching in world coordinates, denser
            where it is darker; in the dark theme the same becomes a scratchboard, the lines drawing the light.</li>
          <li><b>Light.</b> Every point takes the two lamps of its nearest hexagon: the shader resolves the point
            onto the lattice axes and finds the nearest centre by cube rounding — in the neighbouring galleries too.</li>
          <li><b>Motion.</b> The way is one curve, and whatever its length the walk reaches the shelf in 8.6 seconds
            (accelerate, cruise, slow down). On the way the camera stays at eye level and looks down at most 10°, and
            only on the stairs; at the end it turns to the shelf, crouching for the low ones and looking up to the
            high ones.</li>
          <li><b>Performance.</b> Everything that repeats — books, shelves, walls, stair treads — is drawn instanced;
            on slower machines fewer floors are shown.</li>
          <li><b>Skippable.</b> Esc or a button; with reduced motion there is no walk; three.js is only downloaded
            by those who walk.</li>
        </ul>
      </section>

      <section id="about-privacy">
        <h2>What never leaves your computer</h2>
        <p>
          Everything is computed in your browser; there is no server of our own behind the page, and no account,
          cookie, analytics or tracking. Your kept pages, the page you were reading, the language, the theme, the
          shelving and your “don’t walk” choice stay in the browser’s local storage and go nowhere. The site is
          served by GitHub Pages: like the host of any website, GitHub sees the download (your IP address, for
          instance) — no one else does. The typefaces come from here too, not from an outside font service.
        </p>
      </section>

      <section id="about-checks">
        <h2>How we checked</h2>
        <p>
          A round-trip test checks the address ↔ page mapping; more than seventy checks cover places, page turning,
          the description of searches, the languages, the shelvings and the distances — about a hundred checks
          (<code>location.test.mjs</code>). The design decisions are in the project’s <code>docs/DESIGN.md</code>.
        </p>
      </section>
    </>
  );
}

export default function AboutView() {
  const lang = useLang();
  const layout = useLayout();
  const f = useFacts(layout);
  const sections = SECTIONS[lang] ?? SECTIONS.en;
  return (
    <div className="about">
      <nav className="about-toc" aria-label={lang === 'hu' ? 'Tartalom' : 'Contents'}>
        <ol>
          {sections.map(([id, title]) => (
            <li key={id}><a href={`#about-${id}`}>{title}</a></li>
          ))}
        </ol>
      </nav>
      <article className="about-text">
        <h1>{lang === 'hu' ? 'A könyvtárról' : 'About the library'}</h1>
        {lang === 'hu' ? <Hu f={f} /> : <En f={f} />}
      </article>
    </div>
  );
}
