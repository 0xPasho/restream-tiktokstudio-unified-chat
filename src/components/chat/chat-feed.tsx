'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown } from 'lucide-react';
import { ChatMessage } from './chat-message';
import { PlatformIcon } from './platform-icon';
import { SettingsDialog } from './settings-dialog';
import { PLATFORM_META, type Platform } from '@/lib/types';
import { collapse } from '@/lib/collapse';
import { useChatStream, type ConnState } from '@/lib/use-chat-stream';
import { passesView, useViewPrefs } from '@/lib/view-prefs';
import { cn } from '@/lib/utils';

const PLATFORMS: Platform[] = ['tiktok', 'twitch', 'youtube', 'kick'];
const MAX = 400;   // tope en memoria; el historial completo vive en SQLite

/** Cómo se ve cada estado de conexión en el botón de plataforma. */
const STATE_DOT: Record<ConnState, string> = {
  connected:    'bg-emerald-400',
  connecting:   'bg-amber-400 animate-pulse',
  disconnected: 'bg-amber-500',
  error:        'bg-red-500',
  offline:      'bg-zinc-600',
};

export function ChatFeed() {
  const prefs = useViewPrefs();
  const [hidden, setHidden] = useState<Set<Platform>>(new Set());

  const scroller = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(true);   // pegado al fondo
  const pinnedRef = useRef(true);               // el mismo dato, legible desde callbacks
  const [unread, setUnread] = useState(0);

  // Contar los no leídos aquí, donde llegan los datos, evita un setState
  // dentro de un efecto y el render extra por mensaje que eso implica.
  const { events, stats, live } = useChatStream({
    max: MAX,
    onFresh: (fresh) => {
      if (!pinnedRef.current) setUnread((n) => n + fresh.length);
    },
  });

  const visible = useMemo(
    () => collapse(events.filter((e) => !hidden.has(e.platform) && passesView(e, prefs))),
    [events, hidden, prefs],
  );

  // Auto-scroll sólo si el usuario no subió a leer algo.
  // El efecto escribe al DOM y nada más: meter setState aquí encadenaría
  // un render extra por cada mensaje que entra.
  useEffect(() => {
    if (!pinnedRef.current) return;
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [visible.length]);

  const onScroll = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    pinnedRef.current = atBottom;
    setPinned(atBottom);
    if (atBottom) setUnread(0);
  }, []);

  const toBottom = () => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
    pinnedRef.current = true;
    setPinned(true);
    setUnread(0);
  };

  const toggle = (p: Platform) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });

  const counts = Object.fromEntries((stats?.byPlatform ?? []).map((r) => [r.platform, r.n]));
  const viewers = (stats?.viewers ?? []).reduce((a, r) => a + (r.viewers ?? 0), 0);
  const errors = stats?.status?.errors ?? [];
  const connected = PLATFORMS.filter((p) => stats?.status?.platforms?.[p]?.state === 'connected')
    .map((p) => PLATFORM_META[p].label);

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-white/8 bg-[#0d0d10]">
      {/* ── encabezado ── */}
      <header className="flex items-center gap-2 border-b border-white/8 px-3 py-2">
        <span className="flex items-center gap-1.5 text-[13px] font-semibold text-zinc-200">
          <span className={cn('size-1.5 rounded-full', live ? 'animate-pulse bg-emerald-400' : 'bg-zinc-600')} />
          Chat unificado
        </span>

        <div className="ml-auto flex items-center gap-1">
          {PLATFORMS.map((p) => {
            const off = hidden.has(p);
            const conn = stats?.status?.platforms?.[p];
            const state = conn?.state ?? 'connecting';
            return (
              <button
                key={p}
                onClick={() => toggle(p)}
                title={[
                  PLATFORM_META[p].label,
                  conn?.detail ?? state,
                  counts[p] ? `${counts[p]} mensajes` : null,
                  off ? 'oculto — clic para mostrar' : 'clic para ocultar',
                ].filter(Boolean).join(' · ')}
                aria-pressed={!off}
                className={cn(
                  'relative flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium transition',
                  'focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:outline-none',
                  off ? 'text-zinc-600 hover:text-zinc-400' : 'text-zinc-200 hover:bg-white/5',
                )}
                style={!off ? { backgroundColor: `${PLATFORM_META[p].color}1f` } : undefined}
              >
                <PlatformIcon
                  platform={p}
                  className="size-3.5"
                  style={{ color: off ? undefined : PLATFORM_META[p].color }}
                />
                <span className="tabular-nums">{counts[p] ?? 0}</span>
                <span
                  className={cn(
                    'absolute -top-px -right-px size-1.5 rounded-full ring-2 ring-[var(--chat-bg)]',
                    STATE_DOT[state],
                  )}
                  aria-hidden
                />
              </button>
            );
          })}

          <SettingsDialog />
        </div>
      </header>

      {/* ── feed ── */}
      <div className="relative min-h-0 flex-1">
        <div
          ref={scroller}
          onScroll={onScroll}
          className="h-full overflow-y-auto overscroll-contain scroll-smooth px-1.5 py-2"
        >
          {visible.length === 0 ? (
            <div className="grid h-full place-items-center px-6 text-center">
              <div className="space-y-1.5">
                <p className="text-sm text-zinc-500">Esperando mensajes…</p>
                {errors.length > 0 ? (
                  <ul className="space-y-1 text-[11px] text-amber-400/80">
                    {errors.slice(0, 3).map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                ) : (
                  <p className="text-[11px] text-zinc-600">
                    {connected.length > 0
                      ? `Conectado a ${connected.join(', ')}.`
                      : 'Conectando a las plataformas…'}
                  </p>
                )}
              </div>
            </div>
          ) : (
            // `justify-end` + `min-h-full`: con pocos mensajes se pegan abajo,
            // como cualquier chat, en vez de flotar arriba dejando un hueco.
            <ul className="flex min-h-full flex-col justify-end gap-0.5">
              {visible.map((e, i) => (
                <ChatMessage
                  key={e.id}
                  event={e}
                  showTime={i === 0 || e.ts - visible[i - 1].ts > 60_000}
                />
              ))}
            </ul>
          )}
        </div>

        {!pinned && (
          <button
            onClick={toBottom}
            className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[12px] font-semibold text-zinc-900 shadow-lg transition hover:bg-zinc-200"
          >
            <ArrowDown className="size-3.5" />
            {unread > 0 ? `${unread} mensaje${unread > 1 ? 's' : ''} nuevo${unread > 1 ? 's' : ''}` : 'Ir al final'}
          </button>
        )}
      </div>

      {/* ── pie ── */}
      <footer className="flex items-center gap-2 border-t border-white/8 px-3 py-1.5 text-[11px] text-zinc-500">
        {prefs.messagesOnly && (
          <span className="rounded-full bg-white/8 px-1.5 py-px text-zinc-300">sólo mensajes</span>
        )}
        {!prefs.showBots && <span className="text-zinc-600">sin bots</span>}
        <span className="ml-auto tabular-nums">
          {viewers > 0 && <>👁 {viewers.toLocaleString('es-MX')} · </>}
          {stats?.total.toLocaleString('es-MX') ?? 0} eventos
        </span>
      </footer>
    </div>
  );
}
