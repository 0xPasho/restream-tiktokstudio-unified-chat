import Database from 'better-sqlite3';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ChatEvent } from './types';

const DB_PATH = process.env.CHAT_DB_PATH ?? resolve(process.cwd(), 'data', 'chat.db');

let db: Database.Database | null = null;

/**
 * Read-only handle for the UI. The collector owns the writer and creates the
 * file at startup, so this should always find it — but a readonly open against
 * a missing file throws, and a 500 on the very first request would be a rough
 * first impression. Callers treat `null` as "no data yet".
 */
function conn(): Database.Database | null {
  if (db) return db;
  // `turbopackIgnore` porque DB_PATH se resuelve en tiempo de ejecución (puede
  // venir de CHAT_DB_PATH). Sin esto el analizador no puede acotar la ruta y
  // arrastra todo el proyecto al bundle del servidor.
  if (!existsSync(/* turbopackIgnore: true */ DB_PATH)) return null;
  db = new Database(DB_PATH, { readonly: true });
  db.pragma('journal_mode = WAL');   // read without blocking the collector
  return db;
}

type Row = Omit<ChatEvent, 'badges' | 'meta' | 'is_bot' | 'is_moderator' | 'is_subscriber' | 'is_first'> & {
  badges: string | null; meta: string | null;
  is_bot: number; is_moderator: number; is_subscriber: number; is_first: number;
};

function hydrate(r: Row): ChatEvent {
  return {
    ...r,
    is_bot: !!r.is_bot,
    is_moderator: !!r.is_moderator,
    is_subscriber: !!r.is_subscriber,
    is_first: !!r.is_first,
    badges: r.badges ? JSON.parse(r.badges) : [],
    meta: r.meta ? JSON.parse(r.meta) : null,
  };
}

const COLS = `id, platform, type, ts, user_id, handle, nickname, avatar, color, text,
              is_bot, is_moderator, is_subscriber, is_first, badges, meta`;

/** Últimos N eventos, devueltos en orden cronológico (el más viejo primero). */
export function recentEvents(limit = 120): ChatEvent[] {
  const c = conn();
  if (!c) return [];
  const rows = c
    .prepare(`SELECT ${COLS} FROM events ORDER BY id DESC LIMIT ?`)
    .all(limit) as Row[];
  return rows.reverse().map(hydrate);
}

/** Eventos posteriores a un id — el corazón del streaming en vivo. */
export function eventsSince(sinceId: number, limit = 200): ChatEvent[] {
  const c = conn();
  if (!c) return [];
  const rows = c
    .prepare(`SELECT ${COLS} FROM events WHERE id > ? ORDER BY id ASC LIMIT ?`)
    .all(sinceId, limit) as Row[];
  return rows.map(hydrate);
}

/**
 * Eventos anteriores a un id, devueltos en orden cronológico. Es lo que pide el
 * feed al llegar arriba del todo: el SSE sólo manda una ventana reciente, y sin
 * esto el historial existe en SQLite pero no hay forma de alcanzarlo.
 */
export function eventsBefore(beforeId: number, limit = 80): ChatEvent[] {
  const c = conn();
  if (!c) return [];
  const rows = c
    .prepare(`SELECT ${COLS} FROM events WHERE id < ? ORDER BY id DESC LIMIT ?`)
    .all(beforeId, limit) as Row[];
  return rows.reverse().map(hydrate);
}

export function stats() {
  const c = conn();
  if (!c) return { total: 0, byPlatform: [], viewers: [] };
  const total = (c.prepare(`SELECT COUNT(*) n FROM events`).get() as { n: number }).n;
  const byPlatform = c
    .prepare(`SELECT platform, COUNT(*) n FROM events WHERE type='chat' GROUP BY platform`)
    .all() as { platform: string; n: number }[];
  const viewers = c
    .prepare(`SELECT platform, viewers FROM metrics WHERE ts = (SELECT MAX(ts) FROM metrics m2 WHERE m2.platform = metrics.platform)`)
    .all() as { platform: string; viewers: number }[];
  return { total, byPlatform, viewers };
}
