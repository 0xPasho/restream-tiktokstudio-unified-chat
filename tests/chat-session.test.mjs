import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

const requireDependency = createRequire(import.meta.url);

// Load the server's TypeScript and @/ aliases without starting live collectors.
function loadServer() {
  const cache = new Map();
  function load(file) {
    file = resolve(file);
    if (cache.has(file)) return cache.get(file).exports;
    const mod = { exports: {} };
    cache.set(file, mod);
    const code = ts.transpileModule(readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;
    const localRequire = (name) => {
      if (name.startsWith('@/')) return load(resolve('src', `${name.slice(2)}.ts`));
      if (name.startsWith('.')) return load(resolve(dirname(file), `${name}.ts`));
      return requireDependency(name);
    };
    new Function('require', 'module', 'exports', code)(localRequire, mod, mod.exports);
    return mod.exports;
  }
  return load;
}

async function connect(route) {
  const abort = new AbortController();
  const response = await route.GET(new Request('http://localhost/api/stream', { signal: abort.signal }));
  const reader = response.body.getReader();
  return {
    close: () => abort.abort(),
    async next(kind) {
      for (;;) {
        const { value, done } = await reader.read();
        assert.equal(done, false);
        const chunk = new TextDecoder().decode(value);
        if (chunk.startsWith(`event: ${kind}\n`)) return JSON.parse(chunk.split('\ndata: ')[1].trim());
      }
    },
  };
}

test('new stream is explicit, persistent, shared, and preserves history and settings', { timeout: 10000 }, async (t) => {
  const directory = mkdtempSync(resolve(tmpdir(), 'chat-session-test-'));
  process.env.CHAT_DB_PATH = resolve(directory, 'chat.db');
  const load = loadServer();
  const writer = load('src/server/db.ts');
  const settings = load('src/server/settings.ts');
  const sessions = load('src/server/session.ts');
  const stream = load('src/app/api/stream/route.ts');
  const sessionRoute = load('src/app/api/session/route.ts');
  const history = load('src/app/api/history/route.ts');
  const streams = [];
  t.after(() => {
    streams.forEach(s => s.close());
    writer.writeDb().close();
    rmSync(directory, { recursive: true, force: true });
  });
  const insert = writer.makeInsert();
  settings.saveSettings({ restreamToken: 'test-token', tiktokUsername: 'test-user' });
  insert({ platform: 'tiktok', type: 'chat', ts: Date.now(), text: 'previous stream' });
  const dashboard = await connect(stream);
  const overlay = await connect(stream);
  streams.push(dashboard, overlay);
  assert.equal((await dashboard.next('init')).events.length, 1);
  assert.equal((await overlay.next('init')).events.length, 1);

  const { session } = await (await sessionRoute.POST()).json();
  assert.deepEqual(session, { id: 1, afterId: 1 });
  for (const client of streams) {
    const reset = await client.next('init');
    assert.deepEqual(reset.events, []);
    assert.deepEqual(reset.session, session);
    assert.deepEqual(reset.stats.byPlatform, []);
  }
  insert({ platform: 'twitch', type: 'chat', ts: Date.now(), text: 'current stream' });
  for (const client of streams) assert.equal((await client.next('events'))[0].text, 'current stream');

  // Reopening SSE (also used on reload) must not advance or clear the session.
  const reconnect = await connect(stream);
  streams.push(reconnect);
  const initial = await reconnect.next('init');
  assert.deepEqual(initial.session, session);
  assert.deepEqual(initial.events.map(e => e.text), ['current stream']);
  assert.deepEqual(initial.stats.byPlatform, [{ platform: 'twitch', n: 1 }]);
  assert.deepEqual(sessions.getChatSession(), session);

  const before = await (await history.GET(new Request('http://localhost/api/history?before=2&limit=80'))).json();
  assert.deepEqual(before.events, []);
  assert.equal(before.hasMore, false);
  assert.equal(before.sessionId, session.id);
  assert.equal(writer.writeDb().prepare('SELECT COUNT(*) AS n FROM events').get().n, 2);
  assert.deepEqual(settings.getSettings(), { restreamToken: 'test-token', tiktokUsername: 'test-user' });

  // Independent module/connection simulates a server restart reading the marker.
  const restarted = loadServer();
  assert.deepEqual(restarted('src/server/session.ts').getChatSession(), session);
  restarted('src/server/db.ts').writeDb().close();

  const second = await (await sessionRoute.POST()).json();
  const third = await (await sessionRoute.POST()).json();
  assert.equal(second.session.afterId, 2);
  assert.equal(third.session.afterId, 2);
  assert.equal(third.session.id, second.session.id + 1);
  assert.equal(writer.writeDb().prepare('SELECT COUNT(*) AS n FROM events').get().n, 2);
});
