/**
 * Lo que un evento vale en dinero, normalizado entre plataformas.
 *
 * Cada plataforma expone una cosa distinta y sólo YouTube expone dinero de
 * verdad: un Super Chat trae importe y moneda, una sub de Twitch o Kick sólo
 * trae nivel y meses, los bits traen conteo y los diamantes de TikTok también.
 * Guardamos lo que llegó tal cual y derivamos aquí lo que la UI necesita, en
 * vez de convertir al vuelo en el colector: las tasas cambian y las filas ya
 * guardadas no.
 */
export type TipKind = 'money' | 'bits' | 'diamonds' | 'sub';

export type Tip = {
  kind: TipKind;
  /** Importe en su propia unidad: dinero en `currency`, o conteo de bits/diamantes. */
  amount?: number;
  /** ISO 4217, sólo con `kind: 'money'`. */
  currency?: string;
  /** La cifra ya formateada por la plataforma. Si viene, manda: es su moneda y su formato. */
  display?: string;
  /** 'Prime', '1', '2', '3' en Twitch; el nombre del plan en Kick y YouTube. */
  tier?: string;
  months?: number;
  /** Subs regaladas o regalos repetidos. */
  count?: number;
};

/**
 * Tasas aproximadas a dólares. **No se muestran nunca**: lo único que deciden
 * es cuánto resalta la fila. Por eso da igual que el peso se mueva un 10% —
 * un super chat de MX$100 cae en el mismo nivel hoy que dentro de un año — y
 * por eso no hay que ir a buscar tasas en vivo para esto.
 */
const USD_PER_UNIT: Record<string, number> = {
  USD: 1, EUR: 1.09, GBP: 1.27, CAD: 0.72, AUD: 0.65, CHF: 1.13, JPY: 0.0065,
  MXN: 0.055, BRL: 0.18, ARS: 0.0008, COP: 0.00025, CLP: 0.001, PEN: 0.27,
  UYU: 0.025, GTQ: 0.13, DOP: 0.017, CRC: 0.002, BOB: 0.14, PYG: 0.00013,
  SEK: 0.095, NOK: 0.092, DKK: 0.145, PLN: 0.25, CZK: 0.043, RON: 0.22,
  INR: 0.012, PHP: 0.017, IDR: 0.000063, THB: 0.029, TRY: 0.029, ZAR: 0.055,
};

/** Precio de lista de una sub. Twitch y Kick cobran lo mismo por nivel. */
const USD_PER_SUB: Record<string, number> = { prime: 4.99, '1': 4.99, '2': 9.99, '3': 24.99 };

const USD_PER_BIT = 0.01;       // Twitch vende 100 bits por ~1.40 y paga 1 centavo por bit
const USD_PER_DIAMOND = 0.005;  // un diamante es medio coin, y el coin ronda el centavo

/** Lee la propina de `meta` validando la forma: los datos vienen de la red. */
export function tipOf(meta: Record<string, unknown> | null | undefined): Tip | null {
  const raw = meta?.tip;
  if (!raw || typeof raw !== 'object') return null;

  const t = raw as Record<string, unknown>;
  const kind = t.kind;
  if (kind !== 'money' && kind !== 'bits' && kind !== 'diamonds' && kind !== 'sub') return null;

  const number = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
  const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

  return {
    kind,
    amount: number(t.amount),
    currency: text(t.currency)?.toUpperCase(),
    display: text(t.display),
    tier: text(t.tier),
    months: number(t.months),
    count: number(t.count),
  };
}

/**
 * Estimado en dólares. Existe sólo para ordenar el énfasis visual; no es un
 * dato que se enseñe ni con el que se pueda hacer contabilidad.
 */
export function tipUsd(tip: Tip): number {
  if (tip.kind === 'bits') return (tip.amount ?? 0) * USD_PER_BIT;
  if (tip.kind === 'diamonds') return (tip.amount ?? 0) * USD_PER_DIAMOND;

  if (tip.kind === 'sub') {
    const key = (tip.tier ?? '1').toLowerCase();
    const price = USD_PER_SUB[key] ?? USD_PER_SUB[key.replace(/[^\d]/g, '')] ?? USD_PER_SUB['1'];
    return price * Math.max(1, tip.count ?? 1);
  }

  // Moneda desconocida: la tratamos 1:1 con el dólar. Falla hacia "resaltar de
  // más", que en un chat de directo es el error barato.
  return (tip.amount ?? 0) * (USD_PER_UNIT[tip.currency ?? 'USD'] ?? 1);
}

/**
 * Cuánto resalta la fila, de 0 a 3. Los cortes están en dólares y no en la
 * moneda local para que una rosa de TikTok y un sub de Twitch se midan igual.
 *
 * 0 es el ruido de fondo —una rosa, un like de un centavo— y se queda como una
 * tira más del feed. A partir de 1 la fila se convierte en tarjeta.
 */
export function tipLevel(tip: Tip): 0 | 1 | 2 | 3 {
  const usd = tipUsd(tip);
  if (usd >= 50) return 3;
  if (usd >= 10) return 2;
  if (usd >= 2) return 1;
  return 0;
}

const compact = (n: number) =>
  n >= 10_000 ? new Intl.NumberFormat('es-MX', { notation: 'compact' }).format(n)
              : new Intl.NumberFormat('es-MX').format(n);

/** Lo que se lee dentro de la píldora. Corto: compite con el mensaje, no lo tapa. */
export function tipAmountLabel(tip: Tip): string {
  if (tip.kind === 'money') {
    // La cifra de la plataforma gana siempre: ya viene en su moneda y su formato.
    if (tip.display) return tip.display;
    if (tip.amount == null) return 'Super Chat';
    if (!tip.currency) return compact(tip.amount);
    try {
      return new Intl.NumberFormat('es-MX', {
        style: 'currency',
        currency: tip.currency,
        maximumFractionDigits: Number.isInteger(tip.amount) ? 0 : 2,
      }).format(tip.amount);
    } catch {
      return `${compact(tip.amount)} ${tip.currency}`;   // código de moneda inventado
    }
  }

  if (tip.kind === 'bits') return `${compact(tip.amount ?? 0)} bits`;
  if (tip.kind === 'diamonds') return compact(tip.amount ?? 0);

  const tier = tip.tier && /^\d$/.test(tip.tier) ? `Tier ${tip.tier}` : tip.tier;
  return tier ?? 'Sub';
}

/** El detalle que no cabe en la píldora: meses acumulados, subs regaladas. */
export function tipNote(tip: Tip): string | null {
  const parts: string[] = [];
  if (tip.kind === 'sub' && (tip.count ?? 1) > 1) parts.push(`×${tip.count} regaladas`);
  if (tip.months && tip.months > 1) parts.push(`${tip.months} meses`);
  return parts.length ? parts.join(' · ') : null;
}
