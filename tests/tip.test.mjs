import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

const requireDependency = createRequire(import.meta.url);

/** Carga TypeScript con los alias `@/` sin arrancar Next ni los colectores. */
function loadModule() {
  const cache = new Map();
  function load(file) {
    file = resolve(file);
    if (cache.has(file)) return cache.get(file).exports;
    const mod = { exports: {} };
    cache.set(file, mod);
    const code = ts.transpileModule(readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;
    const localRequire = (name) => {
      if (name.startsWith('@/')) return load(resolve('src', `${name.slice(2)}.ts`));
      if (name.startsWith('.')) return load(resolve(dirname(file), `${name}.ts`));
      return requireDependency(name);
    };
    new Function('require', 'module', 'exports', code)(localRequire, mod, mod.exports);
    return mod.exports;
  }
  return load;
}

const load = loadModule();
const { extractTip, parseMoney, sampleRaw } = load('src/server/tip-extract.ts');
const { tipOf, tipUsd, tipLevel, tipAmountLabel, tipNote } = load('src/lib/tip.ts');

/** Pasa por el mismo viaje que en producción: se serializa a SQLite y vuelve. */
const roundTrip = (tip) => tipOf(JSON.parse(JSON.stringify({ tip })));

test('el importe de un super chat sobrevive a los nombres que use la plataforma', () => {
  const shapes = [
    { text: 'gracias!', amount: 100, currency: 'MXN' },
    { superChat: { amountMicros: 100_000_000, currencyCode: 'MXN' } },
    { donation: { formattedAmount: 'MX$100.00' } },
    { amount_value: 100, currency_code: 'mxn' },
  ];

  for (const payload of shapes) {
    const tip = roundTrip(extractTip(payload, 'chat'));
    assert.equal(tip.kind, 'money', JSON.stringify(payload));
    assert.equal(tip.amount, 100, JSON.stringify(payload));
    assert.equal(tip.currency, 'MXN', JSON.stringify(payload));
  }
});

test('se muestra la cifra de la plataforma, no una conversión nuestra', () => {
  const tip = roundTrip(extractTip({ displayString: 'MX$1,000.00', currency: 'MXN' }, 'chat'));
  assert.equal(tipAmountLabel(tip), 'MX$1,000.00');
  // Mil pesos son ~55 dólares: la fila sube al nivel más alto.
  assert.equal(tipLevel(tip), 3);

  // Sin cadena formateada la componemos con la moneda a la vista. El glifo
  // exacto lo pone el ICU de quien renderiza ("US$5" en Chrome, "USD 5" en
  // Node), así que lo que se comprueba es que estén la cifra y la moneda.
  const plain = tipAmountLabel(roundTrip(extractTip({ amount: 5, currency: 'USD' }, 'chat')));
  assert.match(plain, /US\$?D?\s?5$/);
});

test('un número suelto sin moneda no es dinero', () => {
  assert.equal(extractTip({ text: 'hola', value: 42 }, 'chat'), null);
  assert.equal(extractTip({ text: 'hola' }, 'chat'), null);

  // En una sub regalada ese mismo número son subs, no dólares.
  const gifted = roundTrip(extractTip({ tier: '1000', amount: 5 }, 'gift'));
  assert.equal(gifted.kind, 'sub');
  assert.equal(gifted.count, 5);
  assert.equal(tipNote(gifted), '×5 regaladas');
  assert.equal(Math.round(tipUsd(gifted)), 25);
});

test('subs: nivel, meses y precio de lista', () => {
  const t2 = roundTrip(extractTip({ subscriptionTier: '2000', cumulativeMonths: 6 }, 'sub'));
  assert.equal(tipAmountLabel(t2), 'Tier 2');
  assert.equal(tipNote(t2), '6 meses');
  assert.equal(tipLevel(t2), 1);

  const prime = roundTrip(extractTip({ isPrime: true }, 'sub'));
  assert.equal(tipAmountLabel(prime), 'Prime');

  // Kick y YouTube no mandan nivel: sigue siendo una sub y se cobra como tier 1.
  const bare = roundTrip(extractTip({ months: 1 }, 'sub'));
  assert.equal(bare.kind, 'sub');
  assert.equal(tipAmountLabel(bare), 'Sub');
  assert.equal(tipNote(bare), null);
});

test('los bits cuentan como dinero a centavo por bit', () => {
  const few = roundTrip(extractTip({ text: 'Cheer100', bits: 100 }, 'chat'));
  assert.equal(tipAmountLabel(few), '100 bits');
  assert.equal(tipLevel(few), 0);           // un dólar no interrumpe el feed
  assert.equal(tipLevel(roundTrip({ kind: 'bits', amount: 5000 })), 3);
});

test('los diamantes de TikTok se miden con la misma vara', () => {
  assert.equal(tipLevel(roundTrip({ kind: 'diamonds', amount: 1 })), 0);       // una rosa
  assert.equal(tipLevel(roundTrip({ kind: 'diamonds', amount: 1000 })), 1);    // ~5 dólares
  // Los diamantes llegan por millares: la píldora no puede crecer con ellos.
  assert.match(tipAmountLabel(roundTrip({ kind: 'diamonds', amount: 12_345 })), /^12\s?\D+$/);
});

test('separador decimal ambiguo', () => {
  assert.deepEqual(parseMoney('10,50 €'), { amount: 10.5, currency: 'EUR' });
  assert.deepEqual(parseMoney('$1,000'), { amount: 1000, currency: 'USD' });
  assert.deepEqual(parseMoney('R$ 1.234,56'), { amount: 1234.56, currency: 'BRL' });
  assert.equal(parseMoney('sin cifras'), null);
});

test('meta corrupta o ajena no llega a la interfaz', () => {
  assert.equal(tipOf(null), null);
  assert.equal(tipOf({}), null);
  assert.equal(tipOf({ tip: 'MX$100' }), null);
  assert.equal(tipOf({ tip: { kind: 'bitcoin', amount: 1 } }), null);
  // Campos con el tipo equivocado se descartan uno a uno, sin tirar el resto.
  assert.deepEqual(tipOf({ tip: { kind: 'money', amount: '100', currency: 'mxn' } }),
    { kind: 'money', amount: undefined, currency: 'MXN', display: undefined, tier: undefined, months: undefined, count: undefined });
});

test('el payload crudo se guarda sin el autor y acotado', () => {
  const raw = sampleRaw({ author: { name: 'x', badges: [] }, amount: 5, currency: 'USD' });
  assert.equal(raw, '{"amount":5,"currency":"USD"}');
  assert.equal(sampleRaw({ author: { name: 'x' } }), null);
  assert.ok(sampleRaw({ text: 'x'.repeat(5000) }).length <= 1501);
});
