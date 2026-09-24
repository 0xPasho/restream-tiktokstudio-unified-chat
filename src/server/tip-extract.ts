import type { Tip } from '@/lib/tip';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Saca el valor en dinero de un evento de Restream.
 *
 * El WebSocket del embed no está documentado y cada plataforma mete lo suyo con
 * el nombre que le da la gana: `amount`, `amountMicros`, `formattedAmount`,
 * `bits`, `tier`… Por eso esto no lee rutas fijas sino que busca por nombre de
 * clave en todo el payload. Cuando no encuentra nada devuelve `null` y el evento
 * se guarda igual, con su payload crudo en `meta.raw` — así el campo que hoy no
 * conocemos se puede leer mañana en la base en vez de perderse.
 */

/** Claves, ya normalizadas a minúsculas y sin guiones bajos. */
const CURRENCY = /^(currency|currencycode|currencyiso)$/;
const DISPLAY = /^((amount|money|value|price|donation|tip)?(display|formatted)(string|amount|text|value)?|formattedamount|displaystring)$/;
const AMOUNT = /^((donation|tip|money|super ?chat|paid|gift)?amount|amountvalue|value|price|total|sum)$/;
const MICROS = /^(amountmicros|micros|amountinmicros)$/;
const BITS = /^(bits|bitsused|bitsamount|bitscount|cheerbits)$/;
const MONTHS = /^(months|cumulativemonths|monthssubscribed|totalmonths|streakmonths|streak|duration|subscriptionlength)$/;
const TIER = /^(tier|subtier|subscriptiontier|plan|planname|subplan|tiername|membershiplevel|subscriptionlevel)$/;
const COUNT = /^(count|quantity|giftcount|giftedcount|recipientcount|subgiftcount|amountofgifts)$/;
const PRIME = /^(isprime|prime)$/;

/** El autor ya está en columnas propias y sus campos confunden la búsqueda. */
const SKIP_SUBTREE = /^(author|user|badges|emotes|avatar|target|owner)$/;

const key = (k: string) => k.toLowerCase().replace(/[_\s-]/g, '');

/**
 * Primera coincidencia recorriendo el payload en anchura. En anchura y no en
 * profundidad a propósito: si `amount` existe arriba y también dentro de un
 * objeto anidado, el de arriba es el del evento.
 */
function find(root: any, pattern: RegExp, want: 'number' | 'string' | 'boolean'): any {
  const queue: [any, number][] = [[root, 0]];

  while (queue.length) {
    const [node, depth] = queue.shift()!;
    if (!node || typeof node !== 'object' || depth > 4) continue;

    const entries = Array.isArray(node)
      ? node.slice(0, 20).map((v, i) => [String(i), v] as const)
      : Object.entries(node);

    for (const [k, value] of entries) {
      if (value == null) continue;
      if (typeof value === 'object') {
        if (!SKIP_SUBTREE.test(key(k))) queue.push([value, depth + 1]);
        continue;
      }
      if (!pattern.test(key(k))) continue;

      if (want === 'boolean' && typeof value === 'boolean') return value;
      if (want === 'string' && typeof value === 'string' && value.trim()) return value.trim();
      if (want === 'number') {
        const n = typeof value === 'number' ? value : Number(String(value).replace(/[^\d.-]/g, ''));
        if (Number.isFinite(n) && n > 0) return n;
      }
    }
  }
  return undefined;
}

const SYMBOLS: [RegExp, string][] = [
  [/mx\$|mxn/, 'MXN'], [/r\$|brl/, 'BRL'], [/ca\$|cad/, 'CAD'], [/a\$|aud/, 'AUD'],
  [/us\$|usd/, 'USD'], [/ar\$|ars/, 'ARS'], [/cl\$|clp/, 'CLP'], [/col\$|cop/, 'COP'],
  [/s\/|pen/, 'PEN'], [/€|eur/, 'EUR'], [/£|gbp/, 'GBP'], [/¥|jpy|jp¥/, 'JPY'],
  [/₡|crc/, 'CRC'], [/₱|php/, 'PHP'], [/₹|inr/, 'INR'], [/\$/, 'USD'],
];

/**
 * "MX$100.00", "€10,50", "$5" → importe y moneda.
 *
 * Sólo hace falta para estimar el nivel de énfasis: lo que se enseña es la
 * cadena original, que ya viene formateada por la plataforma.
 */
export function parseMoney(display: string): { amount: number; currency?: string } | null {
  const amount = parseNumber(display);
  if (amount == null) return null;

  const haystack = display.toLowerCase();
  const iso = display.match(/\b([A-Z]{3})\b/)?.[1];
  const currency = iso ?? SYMBOLS.find(([re]) => re.test(haystack))?.[1];
  return { amount, currency };
}

/** Separador decimal ambiguo: "1,000" son mil y "10,50" son diez y medio. */
function parseNumber(text: string): number | undefined {
  const cleaned = text.replace(/[^\d.,]/g, '');
  if (!/\d/.test(cleaned)) return undefined;

  const cut = Math.max(cleaned.lastIndexOf('.'), cleaned.lastIndexOf(','));
  const tail = cut >= 0 ? cleaned.slice(cut + 1) : '';
  const decimals = tail.length > 0 && tail.length <= 2 ? tail : '';
  const whole = (decimals ? cleaned.slice(0, cut) : cleaned).replace(/[.,]/g, '');

  const n = Number(`${whole || '0'}.${decimals || '0'}`);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * `hint` es el tipo que ya dedujimos por `eventTypeId`. Importa porque un
 * número suelto significa cosas distintas según el evento: en una sub regalada
 * `amount` son cuántas subs, no cuántos dólares. Por eso sólo tratamos algo
 * como dinero si hay señal de moneda — una clave `currency`, micros o un
 * símbolo dentro del texto formateado.
 */
export function extractTip(payload: any, hint: string): Tip | null {
  if (!payload || typeof payload !== 'object') return null;

  const display = find(payload, DISPLAY, 'string');
  const parsed = typeof display === 'string' ? parseMoney(display) : null;
  const currency = find(payload, CURRENCY, 'string') ?? parsed?.currency;
  const micros = find(payload, MICROS, 'number');
  const amount = micros != null ? micros / 1e6 : find(payload, AMOUNT, 'number') ?? parsed?.amount;

  // Dinero: hay importe y algo que diga en qué moneda.
  if (amount != null && (currency || micros != null)) {
    return {
      kind: 'money',
      amount,
      ...(currency ? { currency: String(currency).toUpperCase().slice(0, 4) } : {}),
      ...(display ? { display } : {}),
    };
  }

  const bits = find(payload, BITS, 'number');
  if (bits != null) return { kind: 'bits', amount: bits };

  if (hint === 'sub' || hint === 'gift') {
    const prime = find(payload, PRIME, 'boolean') === true;
    const tierRaw = prime ? 'prime' : find(payload, TIER, 'string') ?? find(payload, TIER, 'number');
    const months = find(payload, MONTHS, 'number');
    const count = find(payload, COUNT, 'number') ?? (hint === 'gift' ? amount : undefined);

    return {
      kind: 'sub',
      ...(tierRaw != null ? { tier: normalizeTier(String(tierRaw)) } : {}),
      ...(months != null && months <= 600 ? { months } : {}),
      ...(count != null && count > 1 ? { count } : {}),
    };
  }

  return null;
}

/** Twitch manda "1000"/"2000"/"3000"; Kick y YouTube mandan el nombre del plan. */
function normalizeTier(tier: string): string {
  const t = tier.trim();
  if (/^prime$/i.test(t)) return 'Prime';
  const digits = t.match(/^(\d)0{0,3}$/)?.[1];
  return digits ?? t.slice(0, 24);
}

/**
 * El payload crudo, recortado, para guardarlo junto al evento.
 *
 * Es la parte que hace que esto se pueda arreglar sin adivinar: la primera vez
 * que llegue un super chat con un campo que no conocemos, el importe seguirá
 * ahí y bastará una consulta a SQLite para ver cómo se llama.
 */
export function sampleRaw(payload: any, limit = 1500): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const { author, badges, emotes, ...rest } = payload as Record<string, unknown>;
  void author; void badges; void emotes;   // ya viajan en columnas propias

  try {
    const json = JSON.stringify(rest);
    if (!json || json === '{}') return null;
    return json.length > limit ? `${json.slice(0, limit)}…` : json;
  } catch {
    return null;   // referencias circulares: no vale la pena pelearse
  }
}
