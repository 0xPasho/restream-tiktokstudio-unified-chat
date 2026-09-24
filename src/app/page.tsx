import { ChatFeed } from '@/components/chat/chat-feed';
import { ChatOverlay, type OverlayOptions } from '@/components/chat/chat-overlay';
import { MessageCard } from '@/components/chat/message-card';
import { eventById } from '@/lib/db';
import { inlineAvatar } from '@/server/avatar';

type SearchParams = Record<string, string | string[] | undefined>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** `?x`, `?x=1`, `?x=true` y `?x=si` cuentan como activado; `?x=0` y `?x=false`, no. */
const flag = (v: string | string[] | undefined, fallback: boolean) => {
  const s = one(v);
  if (s === undefined) return fallback;
  return !/^(0|false|no)$/i.test(s);
};

const num = (v: string | string[] | undefined, fallback: number, min: number, max: number) => {
  const n = Number(one(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;

  // ?card=<id> dibuja un solo mensaje como tarjeta para video, con fondo transparente
  if ('card' in sp) {
    const id = Number(one(sp.card));
    const event = Number.isInteger(id) && id > 0 ? eventById(id) : null;
    if (!event) {
      return <main className="p-6 text-sm text-zinc-400">No hay ningún mensaje con id {one(sp.card) ?? '(vacío)'}.</main>;
    }
    // El avatar se incrusta ahora: la captura vive más que el enlace firmado de TikTok.
    const avatar = await inlineAvatar(event.avatar);
    return <MessageCard event={{ ...event, avatar }} scale={num(sp.scale, 1, 0.5, 3)} />;
  }

  // ?stream activa el modo overlay para OBS / TikTok Studio
  if ('stream' in sp) {
    const opts: OverlayOptions = {
      ttl: num(sp.ttl, 0, 0, 3600),        // 0 = los mensajes no caducan
      max: num(sp.max, 6, 1, 60),
      scale: num(sp.scale, 1.1, 0.5, 3),   // un poco más grande: se lee de lejos
      opacity: num(sp.opacity, 0.82, 0, 1),
      outline: flag(sp.outline, true),
      events: flag(sp.events, true),       // regalos, follows, subs, raids
      likes: flag(sp.likes, false),        // llegan en ráfaga; entierran el chat
      bots: flag(sp.bots, false),          // Streamlabs y compañía ensucian el stream
    };
    return <ChatOverlay opts={opts} />;
  }

  return (
    // Crece con la ventana hasta 860px y nunca baja de 420, salvo que la
    // ventana sea aún más angosta — ahí manda el 100% para que no desborde.
    <main
      className="mx-auto flex h-dvh w-full max-w-[860px] flex-col p-2 sm:p-3"
      style={{ minWidth: 'min(100%, 420px)' }}
    >
      <ChatFeed />
    </main>
  );
}
