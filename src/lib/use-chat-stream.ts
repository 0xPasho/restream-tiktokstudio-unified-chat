'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatEvent, Platform } from './types';

export type ConnState = 'connecting' | 'connected' | 'disconnected' | 'error' | 'offline';

export type Stats = {
  total: number;
  byPlatform: { platform: string; n: number }[];
  viewers: { platform: string; viewers: number }[];
  status?: {
    platforms: Partial<Record<Platform, { state: ConnState; detail?: string }>>;
    errors: string[];
  };
};

/**
 * Suscripción al SSE. La comparten el dashboard y el overlay: la diferencia
 * entre ambos es de presentación, no de datos.
 *
 * `onFresh` se llama con los eventos nuevos de cada tanda; sirve para contar
 * no leídos sin meter un setState dentro de un efecto.
 */
export function useChatStream({
  max = 2000,
  onFresh,
  onSessionChange,
}: {
  max?: number;
  onFresh?: (fresh: ChatEvent[]) => void;
  onSessionChange?: () => void;
} = {}) {
  const [events, setEvents] = useState<ChatEvent[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const sessionRef = useRef<{ id: number; afterId: number } | null>(null);
  const onSessionChangeRef = useRef(onSessionChange);
  const [live, setLive] = useState(false);

  // Guardar el callback en un ref evita que cambiar su identidad reabra el
  // EventSource. La asignación va en un efecto, no en el render: mutar un ref
  // durante el render puede dejar leyendo un valor viejo.
  const onFreshRef = useRef(onFresh);
  useEffect(() => {
    onFreshRef.current = onFresh;
    onSessionChangeRef.current = onSessionChange;
  }, [onFresh, onSessionChange]);

  useEffect(() => {
    const es = new EventSource('/api/stream');

    es.addEventListener('open', () => setLive(true));
    es.addEventListener('error', () => setLive(false));

    es.addEventListener('init', (e) => {
      const d = JSON.parse((e as MessageEvent).data);
      const session = d.session ?? { id: 0, afterId: 0 };
      const changed = sessionRef.current?.id !== session.id;
      sessionRef.current = session;
      if (changed) onSessionChangeRef.current?.();
      setEvents((prev) => {
        if (changed) return d.events.slice(-max);
        // Reconnection retains the loaded conversation and merges missed messages.
        const merged = new Map<number, ChatEvent>(prev.map((event) => [event.id, event]));
        for (const event of d.events as ChatEvent[]) merged.set(event.id, event);
        return [...merged.values()].filter((event) => event.id > session.afterId)
          .sort((a, b) => a.id - b.id).slice(-max);
      });
      setStats({ ...d.stats, status: d.status });
      setLive(true);
    });

    es.addEventListener('events', (e) => {
      const fresh: ChatEvent[] = JSON.parse((e as MessageEvent).data);
      setEvents((prev) => {
        const next = [...prev, ...fresh];
        // El recorte va por delante: al llegar al tope suelta lo más viejo, que
        // siempre se puede volver a pedir con /api/history.
        return next.length > max ? next.slice(-max) : next;
      });
      onFreshRef.current?.(fresh);
    });

    es.addEventListener('stats', (e) => setStats(JSON.parse((e as MessageEvent).data)));

    return () => es.close();
  }, [max]);

  /** Antepone una página de historial, sin duplicar lo que ya está en pantalla. */
  const prepend = useCallback((older: ChatEvent[], sessionId: number) => {
    if (sessionRef.current?.id !== sessionId) return;
    setEvents((prev) => {
      const known = new Set(prev.map((e) => e.id));
      const fresh = older.filter((e) => !known.has(e.id) && e.id > (sessionRef.current?.afterId ?? 0));
      return fresh.length ? [...fresh, ...prev] : prev;
    });
  }, []);

  return { events, stats, live, prepend };
}
