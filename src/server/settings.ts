import { writeDb } from './db';

export type Settings = {
  restreamToken: string;
  tiktokUsername: string;
};

/**
 * Los ajustes viven en SQLite, no en el `.env`.
 *
 * Reescribir el `.env` desde la app haría que Next reiniciara el servidor en
 * dev (observa ese archivo), tumbando los colectores en el mismo momento en que
 * los estás reconfigurando. El `.env` queda como valor inicial: lo que guardes
 * desde la UI lo pisa.
 */
const DEFAULTS: Settings = {
  restreamToken: process.env.RESTREAM_CHAT_TOKEN ?? '',
  tiktokUsername: (process.env.TIKTOK_USERNAME ?? '').replace(/^@/, ''),
};

function ensure() {
  writeDb().exec(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
}

export function getSettings(): Settings {
  ensure();
  const rows = writeDb().prepare(`SELECT key, value FROM settings`).all() as {
    key: string;
    value: string;
  }[];
  const stored = Object.fromEntries(rows.map((r) => [r.key, r.value]));

  return {
    restreamToken: stored.restreamToken ?? DEFAULTS.restreamToken,
    tiktokUsername: (stored.tiktokUsername ?? DEFAULTS.tiktokUsername).replace(/^@/, ''),
  };
}

export function saveSettings(next: Partial<Settings>): Settings {
  ensure();
  const stmt = writeDb().prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  );

  if (next.restreamToken !== undefined) stmt.run('restreamToken', next.restreamToken.trim());
  if (next.tiktokUsername !== undefined) {
    stmt.run('tiktokUsername', next.tiktokUsername.trim().replace(/^@/, ''));
  }

  return getSettings();
}
