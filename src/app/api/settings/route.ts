import { restartCollectors } from '@/server/collector';
import { getSettings, saveSettings } from '@/server/settings';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  return Response.json(getSettings());
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const { restreamToken, tiktokUsername } = (body ?? {}) as Record<string, unknown>;

  if (restreamToken !== undefined && typeof restreamToken !== 'string') {
    return Response.json({ error: 'restreamToken debe ser texto' }, { status: 400 });
  }
  if (tiktokUsername !== undefined && typeof tiktokUsername !== 'string') {
    return Response.json({ error: 'tiktokUsername debe ser texto' }, { status: 400 });
  }

  const saved = saveSettings({
    restreamToken: restreamToken as string | undefined,
    tiktokUsername: tiktokUsername as string | undefined,
  });

  // Los sockets abiertos siguen usando los valores viejos: hay que rehacerlos.
  restartCollectors();

  return Response.json(saved);
}
