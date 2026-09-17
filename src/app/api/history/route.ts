import { getChatSession } from '@/server/session';
import { eventsBefore } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** GET /api/history?before=<id>&limit=<n> — mensajes más viejos que ese id. */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const before = Number(searchParams.get('before'));
  if (!Number.isInteger(before) || before <= 0) {
    return Response.json({ error: 'falta el parámetro `before`' }, { status: 400 });
  }

  const raw = Number(searchParams.get('limit'));
  const limit = Number.isFinite(raw) ? Math.min(200, Math.max(1, raw)) : 80;

  const session = getChatSession();
  const events = eventsBefore(before, limit, session.afterId);

  // `hasMore` a partir del tamaño devuelto: si vino una página completa asumimos
  // que hay más. Evita un COUNT(*) por scroll.
  return Response.json({ events, hasMore: events.length === limit, sessionId: session.id });
}
