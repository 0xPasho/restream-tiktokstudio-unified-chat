import { makeInsert, makeMetric, DB_PATH } from './db';
import { getSettings } from './settings';
import { startRestream } from './restream';
import { startTikTok } from './tiktok';
import { pushError, setState, status } from './status';

type Handle = { stop: () => void };

/**
 * Los colectores arrancan una sola vez por proceso.
 *
 * El guard es global y no un `let` de módulo porque el hot-reload de dev
 * reevalúa los módulos y abriría un socket nuevo en cada guardado — en TikTok
 * eso además gasta una firma del sign server por recarga.
 */
const g = globalThis as typeof globalThis & { __collectors?: Handle[] };

function launch(): Handle[] {
  const insert = makeInsert();
  const metric = makeMetric();
  const { restreamToken, tiktokUsername } = getSettings();
  const handles: Handle[] = [];

  if (restreamToken) {
    handles.push(startRestream({ token: restreamToken, insert }));
  } else {
    for (const p of ['twitch', 'youtube', 'kick'] as const) {
      setState(p, 'offline', 'falta el token de Restream');
    }
    pushError('falta el token de Restream — Twitch, YouTube y Kick desactivados');
  }

  if (tiktokUsername) {
    handles.push(startTikTok({ username: tiktokUsername, insert, metric }));
  } else {
    setState('tiktok', 'offline', 'falta el usuario de TikTok');
    pushError('falta el usuario de TikTok — TikTok desactivado');
  }

  return handles;
}

export function startCollectors() {
  if (g.__collectors) return;
  console.log(`[colector] base de datos → ${DB_PATH}`);
  g.__collectors = launch();
}

/** Corta los sockets vivos y vuelve a arrancar con los ajustes actuales. */
export function restartCollectors() {
  for (const h of g.__collectors ?? []) {
    try { h.stop(); } catch { /* el socket ya estaba muerto */ }
  }
  status.platforms = {};
  status.errors = [];
  status.lastFrameAt = {};
  g.__collectors = launch();
  console.log('[colector] reiniciado con los ajustes nuevos');
}
