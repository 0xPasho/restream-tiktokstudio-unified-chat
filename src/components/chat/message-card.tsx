'use client';

import { ChatAvatar } from './chat-avatar';
import { ChatBadges } from './chat-badges';
import { TipChip } from './tip-chip';
import type { ChatEvent } from '@/lib/types';
import { tipOf } from '@/lib/tip';
import { userColor } from '@/lib/user-color';
import { cn } from '@/lib/utils';

/**
 * Un mensaje solo, dibujado para meterlo en un video.
 *
 * Un short de stream suele abrir con la pregunta que el streamer contesta, y
 * esa pregunta es un mensaje de este chat. Esto lo dibuja a tamaño de lienzo
 * vertical —1000 px de ancho a escala 1, para un canvas de 1080— con fondo
 * transparente, para capturarlo con `npm run shot -- --card <id>` y colocarlo
 * como imagen en el editor.
 *
 * Todo va en `em` sobre un único `font-size`, así `?scale=` agranda o achica la
 * tarjeta completa sin que ninguna pieza se quede atrás. La tarjeta es casi
 * opaca por lo mismo que las píldoras del overlay: encima de metraje claro un
 * negro translúcido no separa nada.
 */
export function MessageCard({ event, scale = 1 }: { event: ChatEvent; scale?: number }) {
  const name = event.nickname ?? event.handle ?? 'anónimo';
  const nameColor = event.color ?? userColor(event.user_id ?? event.handle ?? name);
  const tip = tipOf(event.meta);
  const isChat = event.type === 'chat';
  const handle = event.handle && event.handle !== name ? `@${event.handle.replace(/^@/, '')}` : null;

  return (
    <div
      data-overlay
      data-card
      // Aire para la sombra: la captura recorta este contenedor y una sombra cortada se nota.
      className="w-fit p-[4em]"
      style={{ fontSize: `${16 * scale}px` }}
    >
      <article
        className={cn(
          'w-[62.5em] rounded-[2.5em] bg-[#0d0d10]/95 px-[2.5em] py-[2.25em]',
          'shadow-[0_1.5em_3.75em_rgba(0,0,0,0.45),inset_0_0_0_1px_rgba(255,255,255,0.1)]',
        )}
      >
        <header className="flex items-center gap-[1.5em]">
          <ChatAvatar platform={event.platform} avatar={event.avatar} name={name} size={Math.round(96 * scale)} />

          <div className="min-w-0 flex-1">
            {/* Nada se trunca aquí: un "…" en una imagen que va a un video no se
                puede abrir ni pasar el ratón por encima. Lo largo envuelve. */}
            <div className="flex flex-wrap items-center gap-[0.75em]">
              <span
                className="text-[2.125em] leading-tight font-semibold break-words"
                style={{ color: nameColor }}
              >
                {name}
              </span>
              {/* Los badges vienen en píxeles del feed; `zoom` los sube al tamaño del lienzo. */}
              {event.badges.length > 0 && (
                <span className="flex shrink-0 items-center gap-1" style={{ zoom: 2.2 * scale }}>
                  <ChatBadges badges={event.badges} />
                </span>
              )}
            </div>
            {/* Sólo el @usuario: la plataforma ya la dice el chip del avatar, y la
                hora no significa nada dentro de un clip. */}
            {handle && (
              <div className="mt-[0.2em] text-[1.5em] leading-tight font-medium break-words text-zinc-400">
                {handle}
              </div>
            )}
          </div>

          {tip && <TipChip tip={tip} variant="overlay" className="text-[1.6em]" />}
        </header>

        {event.text && (
          <p
            className={cn(
              'mt-[1.25em] text-[3em] leading-[1.25] font-semibold break-words [text-wrap:pretty]',
              isChat ? 'text-zinc-50' : 'text-zinc-200 italic',
            )}
          >
            {event.text}
          </p>
        )}
      </article>
    </div>
  );
}
