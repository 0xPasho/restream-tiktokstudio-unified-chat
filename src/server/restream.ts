import type { Badge, Platform } from '@/lib/types';
import type { IncomingEvent } from './db';
import { markFrame, pushError, setState } from './status';

/* eslint-disable @typescript-eslint/no-explicit-any */

// eventSourceId → plataforma. Los tres primeros confirmados en vivo.
const SOURCES: Record<number, Platform> = { 2: 'twitch', 13: 'youtube', 29: 'kick', 1: 'youtube' };

// eventTypeId → nuestro tipo. 4 = mensaje de chat (confirmado en vivo).
const TYPES: Record<number, IncomingEvent['type']> = { 4: 'chat', 6: 'follow', 7: 'sub', 8: 'gift', 9: 'raid' };

function badgesOf(author: any): Badge[] {
  return (author?.badges ?? []).map((b: any) => ({
    kind: /mod/i.test(b.title) ? 'mod' : /verif/i.test(b.title) ? 'verified' : 'badge',
    label: b.title,
    imageUrl: b.imageUrl,
  }));
}

/**
 * El servidor manda un `heartbeat` cada pocos segundos. Si pasa este tiempo sin
 * recibir NADA, el socket está vivo pero mudo — un TCP medio abierto no dispara
 * `close`, así que sin este watchdog el colector se queda callado para siempre
 * sin ningún síntoma.
 */
const SILENCE_MS = 45_000;

export function startRestream({
  token,
  insert,
}: {
  token: string;
  insert: (row: IncomingEvent) => boolean;
}) {
  let ws: WebSocket | null = null;
  let backoff = 1000;
  let stopped = false;
  let watchdog: ReturnType<typeof setTimeout> | null = null;

  /** Cada frame recibido reinicia el temporizador de silencio. */
  function kick() {
    markFrame('restream');
    if (watchdog) clearTimeout(watchdog);
    if (stopped) return;
    watchdog = setTimeout(() => {
      pushError('restream: sin datos por 45s, reconectando');
      console.log('[restream] silencio detectado, forzando reconexión');
      ws?.close();   // dispara el handler de close, que reconecta con backoff
    }, SILENCE_MS);
  }

  function connect() {
    if (stopped) return;
    for (const p of ['twitch', 'youtube', 'kick'] as Platform[]) setState(p, 'connecting');

    ws = new WebSocket(`wss://backend.chat.restream.io/ws/embed?token=${token}`);

    ws.addEventListener('open', () => {
      backoff = 1000;
      kick();
      console.log('[restream] ✓ conectado');
    });

    ws.addEventListener('message', (ev) => {
      kick();
      let m: any;
      try { m = JSON.parse(ev.data as string); } catch { return; }

      if (m.action === 'connection_info') {
        const p = m.payload ?? {};
        const plat = SOURCES[p.eventSourceId];
        if (plat) {
          const owner = p.target?.owner;
          setState(plat, p.status === 'connected' ? 'connected' : 'disconnected',
            owner?.displayName ?? owner?.username ?? undefined);
        }
        return;
      }

      if (m.action !== 'event') return;   // heartbeat y demás

      const p = m.payload ?? {};
      const ep = p.eventPayload ?? {};
      const a = ep.author ?? {};

      insert({
        platform: SOURCES[p.eventSourceId] ?? 'restream',
        type: TYPES[p.eventTypeId] ?? 'chat',
        // `eventIdentifier` es el hash único por mensaje. `eventId` NO sirve:
        // es constante durante toda la sesión y se repite entre plataformas,
        // así que usarlo hacía que el índice único descartara en silencio
        // todo mensaje después del primero de cada plataforma.
        external_id: p.eventIdentifier ?? null,
        ts: m.timestamp ? m.timestamp * 1000 : Date.now(),
        user_id: a.id ?? null,
        handle: a.username ?? a.name ?? null,
        nickname: a.displayName ?? a.username ?? null,
        avatar: a.avatar ?? null,
        color: a.color ?? null,
        text: ep.text ?? null,
        is_bot: !!ep.bot,
        is_moderator: (a.badges ?? []).some((b: any) => /mod/i.test(b.title)),
        is_subscriber: a.subscribedFor != null,
        is_first: !!ep.firstMessage,
        badges: badgesOf(a),
        meta: ep.repliedTo ? { repliedTo: ep.repliedTo } : null,
      });
    });

    ws.addEventListener('error', () => pushError('restream: error de socket'));

    ws.addEventListener('close', (e) => {
      if (watchdog) clearTimeout(watchdog);
      if (stopped) return;
      for (const p of ['twitch', 'youtube', 'kick'] as Platform[]) {
        setState(p, 'disconnected', `reintento en ${Math.round(backoff / 1000)}s`);
      }
      console.log(`[restream] cerrado (${e.code}), reintento en ${backoff}ms`);
      setTimeout(connect, backoff);
      backoff = Math.min(backoff * 2, 60_000);
    });
  }

  connect();
  return {
    stop: () => {
      stopped = true;
      if (watchdog) clearTimeout(watchdog);
      ws?.close();
    },
  };
}
