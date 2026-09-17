import { startChatSession } from '@/server/session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST() {
  return Response.json({ session: startChatSession() });
}
