import type { ChatEvent } from './types';

export type FeedItem = ChatEvent & { collapsed?: number };

/**
 * TikTok manda los likes en ráfagas: el mismo usuario genera varias filas
 * idénticas en segundos. Sin esto, un live activo entierra el chat bajo likes.
 *
 * Colapsa eventos consecutivos del mismo usuario y tipo dentro de una ventana,
 * sumando el conteo. Solo aplica a likes y entradas — los mensajes de chat
 * nunca se colapsan, cada uno es contenido distinto.
 */
const COLLAPSIBLE = new Set(['like', 'join']);
const WINDOW_MS = 30_000;

export function collapse(events: ChatEvent[]): FeedItem[] {
  const out: FeedItem[] = [];

  for (const e of events) {
    const prev = out.at(-1);
    const sameRun =
      prev &&
      COLLAPSIBLE.has(e.type) &&
      prev.type === e.type &&
      prev.platform === e.platform &&
      prev.user_id === e.user_id &&
      e.ts - prev.ts < WINDOW_MS;

    if (sameRun) {
      const add = Number((e.meta?.count as number) ?? 1);
      const base = Number((prev.meta?.count as number) ?? 1);
      out[out.length - 1] = {
        ...prev,
        ts: e.ts,
        collapsed: (prev.collapsed ?? 1) + 1,
        meta: { ...prev.meta, count: base + add },
        text: e.type === 'like' ? `mandó ${base + add} likes` : prev.text,
      };
      continue;
    }

    out.push(e);
  }

  return out;
}
