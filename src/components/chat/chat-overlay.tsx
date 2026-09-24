'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChatAvatar } from './chat-avatar';
import { ChatBadges } from './chat-badges';
import { TipChip } from './tip-chip';
import { collapse } from '@/lib/collapse';
import { tipLevel, tipOf } from '@/lib/tip';
import { useChatStream } from '@/lib/use-chat-stream';
import { userColor } from '@/lib/user-color';
import type { ChatEvent } from '@/lib/types';
import { cn } from '@/lib/utils';

export type OverlayOptions = {
  /** Segundos tras los que un mensaje desaparece. 0 = nunca. */
  ttl: number;
  /** Cuántos mensajes se muestran a la vez. */
  max: number;
  /** Escala del texto, para ajustar a la resolución de la escena. */
  scale: number;
  /** Opacidad del fondo de cada mensaje (0–1). */
  opacity: number;
  /** Contorno oscuro alrededor de las letras. */
  outline: boolean;
  /** Mostrar regalos, follows, subs, raids y compartidos. */
  events: boolean;
  /** Mostrar likes. Aparte de `events` porque llegan en ráfaga constante. */
  likes: boolean;
  /** Mostrar mensajes de bots como Streamlabs. */
  bots: boolean;
};

// Las entradas nunca van al overlay: son puro ruido para quien mira el stream.
// Los likes tampoco por defecto — en un live activo llegan cada segundo y
// entierran los mensajes, que es lo único que el espectador quiere leer.
const NEVER = new Set(['join']);

export function ChatOverlay({ opts }: { opts: OverlayOptions }) {
  const { events } = useChatStream({ max: Math.max(opts.max * 2, 60) });
  const container = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);

  // Con ttl activo hay que re-renderizar para que los mensajes caduquen solos,
  // aunque no llegue nada nuevo.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!opts.ttl) return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [opts.ttl]);

  const visible = useMemo(() => {
    const filtered = events.filter((e: ChatEvent) => {
      if (NEVER.has(e.type)) return false;
      if (e.type === 'like') return opts.likes;
      if (e.type !== 'chat' && !opts.events) return false;
      if (!opts.bots && e.is_bot) return false;
      if (opts.ttl && now - e.ts > opts.ttl * 1000) return false;
      return true;
    });
    return collapse(filtered).slice(-opts.max);
  }, [events, opts.events, opts.likes, opts.bots, opts.ttl, opts.max, now]);

  useEffect(() => {
    const frame = container.current;
    const feed = list.current;
    if (!frame || !feed) return;

    // Keep layout measurable, but never broadcast half of an older bubble.
    const fit = () => {
      const top = frame.getBoundingClientRect().top + parseFloat(getComputedStyle(frame).paddingTop);
      for (const child of feed.children) {
        const row = child as HTMLElement;
        row.style.visibility = row.offsetTop + feed.getBoundingClientRect().top < top - 1 ? 'hidden' : 'visible';
      }
    };
    const observer = new ResizeObserver(fit);
    observer.observe(frame);
    observer.observe(feed);
    for (const child of feed.children) observer.observe(child);
    fit();
    return () => observer.disconnect();
  }, [visible]);

  /**
   * Contorno real alrededor de las letras, no una sombra difusa.
   *
   * `paint-order: stroke fill` dibuja el trazo por debajo del relleno, así el
   * texto conserva su forma en vez de engordar. Es el seguro de vida del
   * overlay: aunque el fondo de la píldora falle contra cierta escena, las
   * letras siguen teniendo borde propio.
   */
  const textEdge: React.CSSProperties = opts.outline
    ? {
        paintOrder: 'stroke fill',
        WebkitTextStroke: '0.045em rgba(0,0,0,0.92)',
        textShadow: '0 1px 2px rgba(0,0,0,0.6)',
      }
    : { textShadow: '0 1px 3px rgba(0,0,0,0.9)' };

  return (
    <div
      ref={container}
      data-overlay
      className="flex h-dvh w-full flex-col justify-end overflow-hidden p-3"
      style={{ fontSize: `${opts.scale}rem` }}
    >
      <ul ref={list} className="relative flex shrink-0 flex-col gap-[0.35em]">
        {visible.map((e) => {
          const name = e.nickname ?? e.handle ?? 'anónimo';
          const isChat = e.type === 'chat';
          const tip = tipOf(e.meta);
          const level = tip ? tipLevel(tip) : -1;
          const paid = level >= 1;

          return (
            <li
              key={e.id}
              // Un negro translúcido no separa nada cuando lo que hay detrás ya
              // es oscuro — compartir pantalla de un editor o de GitHub era
              // justo ese caso. Por eso el fondo es casi opaco por defecto y se
              // puede subir con ?opacity.
              className={cn(
                'animate-overlay-in flex w-fit max-w-full items-start gap-[0.5em] rounded-[0.55em]',
                'px-[0.6em] py-[0.3em] backdrop-blur-sm',
              )}
              style={{
                ...(opts.ttl ? { opacity: Math.min(1, Math.max(0, (opts.ttl * 1000 - (now - e.ts)) / 1000)), transition: 'opacity 100ms linear' } : {}),
                // Lo pagado sube a fondo opaco: es lo único del overlay que no
                // puede perderse contra la escena.
                backgroundColor: `rgba(9, 9, 11, ${paid ? Math.min(1, opts.opacity + 0.12) : isChat ? opts.opacity : opts.opacity * 0.9})`,
                // El aro va en `em` y no en píxeles para que aguante cualquier
                // `?scale`, y en `box-shadow` para no mover el layout ni medio
                // píxel: con borde real las filas pagadas bailarían.
                ...(paid
                  ? { boxShadow: `inset 0 0 0 ${0.035 + level * 0.015}em rgba(252, 211, 77, ${0.45 + level * 0.15})` }
                  : {}),
              }}
            >
              <ChatAvatar
                platform={e.platform}
                avatar={e.avatar}
                name={name}
                size={Math.round(opts.scale * 24)}
              />

              <div className="min-w-0">
                <span className="mr-[0.4em] inline-flex items-center gap-[0.3em] align-middle">
                  <span
                    className="text-[0.85em] font-semibold"
                    style={{ color: e.color ?? userColor(e.user_id ?? e.handle ?? name), ...textEdge }}
                  >
                    {name}
                  </span>
                  <ChatBadges badges={e.badges} />
                  {/* El nivel 0 no lleva píldora aquí: en el overlay manda lo
                      que ve el público, y una rosa de un diamante no merece la
                      misma etiqueta dorada que un super chat de mil pesos. En
                      el panel sí aparece — eso lo ves tú, no ellos. */}
                  {paid && tip && <TipChip tip={tip} variant="overlay" />}
                </span>

                <span
                  className={cn(
                    'text-[0.95em] leading-normal font-normal break-words',
                    isChat ? 'text-white' : 'text-white/90 italic',
                  )}
                  style={textEdge}
                >
                  {e.text}
                </span>

                {e.collapsed && e.collapsed > 1 && (
                  <span className="ml-[0.4em] rounded-full bg-white/15 px-[0.4em] text-[0.7em] font-semibold text-white tabular-nums">
                    ×{e.collapsed}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
