import { writeDb } from './db';

export type ChatSession = { id: number; afterId: number };

let initialized = false;
function sessionDb() {
  const db = writeDb();
  if (!initialized) {
    db.exec(`CREATE TABLE IF NOT EXISTS chat_session (
      singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
      id INTEGER NOT NULL,
      after_id INTEGER NOT NULL
    );
    INSERT OR IGNORE INTO chat_session VALUES (1, 0, 0);`);
    initialized = true;
  }
  return db;
}

/** Shared by every browser and OBS; only an explicit action advances it. */
export function getChatSession(): ChatSession {
  return sessionDb().prepare('SELECT id, after_id AS afterId FROM chat_session WHERE singleton = 1').get() as ChatSession;
}

export function startChatSession(): ChatSession {
  const db = sessionDb();
  return db.transaction(() => {
    db.prepare(`UPDATE chat_session SET id = id + 1,
      after_id = (SELECT COALESCE(MAX(id), 0) FROM events) WHERE singleton = 1`).run();
    return getChatSession();
  }).immediate();
}
