'use client';

import { useEffect, useRef, useState } from 'react';
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
  max = 400,
  onFresh,
}: {
  max?: number;
  onFresh?: (fresh: ChatEvent[]) => void;
} = {}) {
  const [events, setEvents] = useState<ChatEvent[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [live, setLive] = useState(false);

  // Guardar el callback en un ref evita que cambiar su identidad reabra el
  // EventSource. La asignación va en un efecto, no en el render: mutar un ref
  // durante el render puede dejar leyendo un valor viejo.
  const onFreshRef = useRef(onFresh);
  useEffect(() => {
    onFreshRef.current = onFresh;
  }, [onFresh]);

  useEffect(() => {
    const es = new EventSource('/api/stream');

    es.addEventListener('open', () => setLive(true));
    es.addEventListener('error', () => setLive(false));

    es.addEventListener('init', (e) => {
      const d = JSON.parse((e as MessageEvent).data);
      setEvents(d.events);
      setStats({ ...d.stats, status: d.status });
      setLive(true);
    });

    es.addEventListener('events', (e) => {
      const fresh: ChatEvent[] = JSON.parse((e as MessageEvent).data);
      setEvents((prev) => [...prev, ...fresh].slice(-max));
      onFreshRef.current?.(fresh);
    });

    es.addEventListener('stats', (e) => setStats(JSON.parse((e as MessageEvent).data)));

    return () => es.close();
  }, [max]);

  return { events, stats, live };
}
