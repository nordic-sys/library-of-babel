// core.test.mjs
import { performance } from 'perf_hooks';
import { getPageText, getPageAddress, ALPHABET, M, M_INV, OFFSET, BITS, LIBRARY_VERSION } from './src/core.js';

let failed = 0;
function check(label, ok) {
  console.log(`${ok ? '✅' : '❌'} ${label}`);
  if (!ok) failed++;
}

function runTests() {
  const mask = (1n << BITS) - 1n;

  check('M * M_INV mod 2^BITS === 1', ((M * M_INV) & mask) === 1n);
  check('M is odd', (M & 1n) === 1n);

  // Regressziós teszt a v1 hibára: a konstansgeneráló az LCG alsó 4 bitjét
  // használta, aminek 16 a periódusa, így M és OFFSET hexa jegyei 16-onként
  // ismétlődtek. Ez kis címeknél láthatóan ismétlődő oldalszöveget adott.
  for (const [name, value] of [['M', M], ['OFFSET', OFFSET]]) {
    const hex = value.toString(16);
    check(`${name} has no 16-digit hex period`, hex.slice(0, 16) !== hex.slice(16, 32));
  }

  for (const addr of [0n, 1n, 42n]) {
    const text = getPageText(addr);
    const blocks = new Set();
    for (let i = 0; i < 3200; i += 64) blocks.add(text.slice(i, i + 64));
    check(`page(${addr}) has no 64-char repeating pattern (${blocks.size}/50 distinct blocks)`, blocks.size === 50);
  }

  const testAddresses = [0n, 1n, 999999999999999999n, mask, mask / 2n];
  let roundTripOk = true;
  for (const addr of testAddresses) {
    if (getPageAddress(getPageText(addr)) !== addr) roundTripOk = false;
  }
  check('round-trip Address -> Text -> Address', roundTripOk);

  const iterations = 100;
  const startGen = performance.now();
  for (let i = 0; i < iterations; i++) getPageText(BigInt(i));
  console.log(`⏱️  Generation (Address -> Text): ${((performance.now() - startGen) / iterations).toFixed(3)} ms/page`);

  const sampleText = ALPHABET[0].repeat(1600) + ALPHABET[10].repeat(1600);
  const startSearch = performance.now();
  for (let i = 0; i < iterations; i++) getPageAddress(sampleText);
  console.log(`⏱️  Search (Text -> Address): ${((performance.now() - startSearch) / iterations).toFixed(3)} ms/page`);

  console.log(`\nLibrary version: v${LIBRARY_VERSION}`);
  if (failed > 0) {
    console.error(`\n${failed} check(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll checks passed.');
}

runTests();
