import { ControlEvent, TikTokLiveConnection, WebcastEvent } from 'tiktok-live-connector';
import type { Badge } from '@/lib/types';
import type { IncomingEvent } from './db';
import { markFrame, pushError, setState } from './status';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Los badges que TikTok Studio pinta junto al nombre. */
function badgesOf(u: any): Badge[] {
  const out: Badge[] = [];
  if (u?.payGrade?.level) out.push({ kind: 'level', label: String(u.payGrade.level) });
  if (u?.fansClubInfo?.clubName) out.push({ kind: 'fansclub', label: u.fansClubInfo.clubName });
  if (u?.userAttr?.isAdmin) out.push({ kind: 'mod', label: 'Mod' });
  if (u?.isSubscribe) out.push({ kind: 'sub', label: 'Sub' });
  return out;
}

function base(type: IncomingEvent['type'], e: any): IncomingEvent {
  const u = e.user ?? {};
  return {
    platform: 'tiktok',
    type,
    external_id: e.common?.msgId ?? null,
    ts: Number(e.common?.createTime) || Date.now(),
    user_id: u.id ?? null,
    handle: u.displayId ?? null,
    nickname: u.nickname ?? null,
    avatar: u.avatarThumb?.urlList?.[0] ?? null,
    is_moderator: !!u.userAttr?.isAdmin,
    is_subscriber: !!u.isSubscribe,
    badges: badgesOf(u),
  };
}

export function startTikTok({
  username,
  insert,
  metric,
}: {
  username: string;
  insert: (row: IncomingEvent) => boolean;
  metric: (platform: 'tiktok', viewers: number) => void;
}) {
  const conn = new TikTokLiveConnection(username, { processInitialData: false });
  let backoff = 1000;
  let stopped = false;

  conn.on(WebcastEvent.CHAT, (e: any) => {
    markFrame('tiktok');
    insert({ ...base('chat', e), text: e.content ?? '' });
  });

  conn.on(WebcastEvent.GIFT, (e: any) => {
    if (e.gift?.type === 1 && e.repeatEnd !== 1) return;   // racha de combo aún abierta
    const repeat = Number(e.repeatCount) || 1;
    const diamonds = (Number(e.gift?.diamondCount) || 0) * repeat;
    insert({
      ...base('gift', e),
      text: `envió ${e.repeatCount}x ${e.gift?.name ?? 'regalo'}`,
      meta: {
        gift: e.gift?.name,
        image: e.gift?.image?.urlList?.[0],
        count: e.repeatCount,
        diamonds: e.gift?.diamondCount,
        // Los diamantes del combo entero, no los de una unidad: 50 rosas de
        // golpe valen lo que 50 rosas, y es el total el que decide si la fila
        // se resalta. Con el mismo formato que Twitch, YouTube y Kick.
        ...(diamonds > 0 ? { tip: { kind: 'diamonds', amount: diamonds } } : {}),
      },
    });
  });

  conn.on(WebcastEvent.FOLLOW, (e: any) => { insert({ ...base('follow', e), text: 'te empezó a seguir' }); });
  conn.on(WebcastEvent.SHARE,  (e: any) => { insert({ ...base('share', e),  text: 'compartió el live' }); });
  conn.on(WebcastEvent.MEMBER, (e: any) => { insert({ ...base('join', e),   text: 'entró al live' }); });

  conn.on(WebcastEvent.LIKE, (e: any) => {
    insert({ ...base('like', e), text: `mandó ${e.count} likes`, meta: { count: e.count } });
  });

  conn.on(WebcastEvent.ROOM_USER, (e: any) => {
    markFrame('tiktok');
    metric('tiktok', Number(e.totalUser ?? e.total ?? 0));
  });

  conn.on(WebcastEvent.STREAM_END, () => setState('tiktok', 'offline', 'el live terminó'));

  conn.on(ControlEvent.ERROR, (err: any) => pushError(`tiktok: ${err?.message ?? err}`));

  // Backoff exponencial: cada reconexión gasta una firma del sign server,
  // así que reintentar en bucle cerrado quemaría la cuota gratis.
  conn.on(ControlEvent.DISCONNECTED, () => {
    if (stopped) return;
    setState('tiktok', 'disconnected', `reintento en ${Math.round(backoff / 1000)}s`);
    setTimeout(connect, backoff);
    backoff = Math.min(backoff * 2, 60_000);
  });

  async function connect() {
    if (stopped) return;
    setState('tiktok', 'connecting');
    try {
      await conn.connect();
      backoff = 1000;
      setState('tiktok', 'connected', `@${username}`);
      console.log(`[tiktok] ✓ conectado a @${username}`);
    } catch (err) {
      const msg = (err as Error)?.message ?? String(err);
      // "user_not_found" y "offline" son estados normales: no estás transmitiendo.
      const offline = /offline|not found|not live/i.test(msg);
      setState('tiktok', offline ? 'offline' : 'error', offline ? 'no estás en vivo' : msg);
      if (!offline) pushError(`tiktok: ${msg}`);
      setTimeout(connect, backoff);
      backoff = Math.min(backoff * 2, 60_000);
    }
  }

  connect();
  return { stop: () => { stopped = true; conn.disconnect(); } };
}
