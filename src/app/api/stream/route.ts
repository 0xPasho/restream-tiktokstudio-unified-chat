import { eventsSince, recentEvents, stats } from '@/lib/db';
import { status } from '@/server/status';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * SSE. Manda el historial reciente al conectar y luego solo lo nuevo.
 * Sondea SQLite cada 400 ms: con WAL activo es una lectura de índice por id,
 * más barato que cualquier IPC entre el colector y el server.
 */
export async function GET(req: Request) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let lastId = 0;
      let closed = false;

      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch { closed = true; }
      };

      const initial = recentEvents(120);
      lastId = initial.at(-1)?.id ?? 0;
      send('init', { events: initial, stats: stats(), status });

      const tick = setInterval(() => {
        if (closed) return;
        try {
          const fresh = eventsSince(lastId);
          if (fresh.length) {
            lastId = fresh.at(-1)!.id;
            send('events', fresh);
          }
        } catch (err) {
          send('error', { message: (err as Error).message });
        }
      }, 400);

      // el estado de conexión viaja con las métricas: un solo tick para ambos
      const statsTick = setInterval(() => send('stats', { ...stats(), status }), 3000);

      const cleanup = () => {
        closed = true;
        clearInterval(tick);
        clearInterval(statsTick);
        try { controller.close(); } catch {}
      };
      req.signal.addEventListener('abort', cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
