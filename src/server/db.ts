import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { Badge, EventType, Platform } from '@/lib/types';

export const DB_PATH = process.env.CHAT_DB_PATH ?? resolve(process.cwd(), 'data', 'chat.db');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  platform      TEXT NOT NULL,
  type          TEXT NOT NULL,
  external_id   TEXT,
  ts            INTEGER NOT NULL,
  user_id       TEXT,
  handle        TEXT,
  nickname      TEXT,
  avatar        TEXT,
  color         TEXT,
  text          TEXT,
  is_bot        INTEGER NOT NULL DEFAULT 0,
  is_moderator  INTEGER NOT NULL DEFAULT 0,
  is_subscriber INTEGER NOT NULL DEFAULT 0,
  is_first      INTEGER NOT NULL DEFAULT 0,
  badges        TEXT,
  meta          TEXT,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

-- Dedup en la base, no en la aplicación: la misma plataforma nunca repite external_id.
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_dedup
  ON events(platform, external_id) WHERE external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_events_ts       ON events(ts DESC);
CREATE INDEX IF NOT EXISTS idx_events_platform ON events(platform, ts DESC);

CREATE TABLE IF NOT EXISTS metrics (
  ts       INTEGER NOT NULL,
  platform TEXT NOT NULL,
  viewers  INTEGER,
  PRIMARY KEY (ts, platform)
);
`;

export type IncomingEvent = {
  platform: Platform;
  type: EventType;
  external_id?: string | null;
  ts: number;
  user_id?: string | null;
  handle?: string | null;
  nickname?: string | null;
  avatar?: string | null;
  color?: string | null;
  text?: string | null;
  is_bot?: boolean;
  is_moderator?: boolean;
  is_subscriber?: boolean;
  is_first?: boolean;
  badges?: Badge[];
  meta?: Record<string, unknown> | null;
};

/** Conexión de escritura, sólo para el colector. La UI abre la suya en readonly. */
let writer: Database.Database | null = null;

export function writeDb() {
  if (!writer) {
    mkdirSync(dirname(DB_PATH), { recursive: true });
    writer = new Database(DB_PATH);
    writer.pragma('journal_mode = WAL');    // la UI lee mientras esto escribe
    writer.pragma('synchronous = NORMAL');
    writer.exec(SCHEMA);
  }
  return writer;
}

export function makeInsert() {
  const stmt = writeDb().prepare(`
    INSERT OR IGNORE INTO events
      (platform, type, external_id, ts, user_id, handle, nickname, avatar, color,
       text, is_bot, is_moderator, is_subscriber, is_first, badges, meta)
    VALUES
      (@platform, @type, @external_id, @ts, @user_id, @handle, @nickname, @avatar, @color,
       @text, @is_bot, @is_moderator, @is_subscriber, @is_first, @badges, @meta)
  `);

  /** Devuelve false si era duplicado — el índice único lo rechazó. */
  return (row: IncomingEvent): boolean =>
    stmt.run({
      platform: row.platform,
      type: row.type,
      external_id: row.external_id ?? null,
      ts: row.ts,
      user_id: row.user_id ?? null,
      handle: row.handle ?? null,
      nickname: row.nickname ?? null,
      avatar: row.avatar ?? null,
      color: row.color ?? null,
      text: row.text ?? null,
      is_bot: row.is_bot ? 1 : 0,
      is_moderator: row.is_moderator ? 1 : 0,
      is_subscriber: row.is_subscriber ? 1 : 0,
      is_first: row.is_first ? 1 : 0,
      badges: row.badges?.length ? JSON.stringify(row.badges) : null,
      meta: row.meta ? JSON.stringify(row.meta) : null,
    }).changes > 0;
}

export function makeMetric() {
  const stmt = writeDb().prepare(
    `INSERT OR REPLACE INTO metrics (ts, platform, viewers) VALUES (?, ?, ?)`,
  );
  return (platform: Platform, viewers: number) =>
    stmt.run(Math.floor(Date.now() / 1000) * 1000, platform, viewers);
}
