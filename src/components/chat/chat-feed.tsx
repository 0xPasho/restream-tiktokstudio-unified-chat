'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown } from 'lucide-react';
import { ChatMessage } from './chat-message';
import { PlatformIcon } from './platform-icon';
import { SettingsDialog } from './settings-dialog';
import { PLATFORM_META, type ChatEvent, type Platform } from '@/lib/types';
import { collapse } from '@/lib/collapse';
import { useChatStream } from '@/lib/use-chat-stream';
import { passesView, useViewPrefs } from '@/lib/view-prefs';
import { cn } from '@/lib/utils';

const PLATFORMS: Platform[] = ['tiktok', 'twitch', 'youtube', 'kick'];
const MAX = 2000;       // tope en memoria; el historial completo vive en SQLite
const PAGE = 80;        // mensajes por página de historial
const NEAR_TOP = 120;   // px desde arriba que disparan la carga

export function ChatFeed() {
  const prefs = useViewPrefs();
  const [hidden, setHidden] = useState<Set<Platform>>(new Set());

  const scroller = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(true);   // pegado al fondo
  const pinnedRef = useRef(true);               // el mismo dato, legible desde callbacks
  const [unread, setUnread] = useState(0);
  const historyGeneration = useRef(0);
  // Contar los no leídos aquí, donde llegan los datos, evita un setState
  // dentro de un efecto y el render extra por mensaje que eso implica.
  const { events, stats, live, prepend } = useChatStream({
    max: MAX,
    onSessionChange: () => {
      historyGeneration.current += 1;
      pinnedRef.current = true;
      setPinned(true);
      setUnread(0);
      setHasMore(true);
      setLoadingOlder(false);
      loadingRef.current = false;
    },
    onFresh: (fresh) => {
      if (!pinnedRef.current) setUnread((n) => n + fresh.filter((e) => !hidden.has(e.platform) && passesView(e, prefs)).length);
    },
  });

  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const loadingRef = useRef(false);   // legible desde el handler de scroll

  /**
   * Trae la página anterior y restaura la posición de lectura.
   *
   * Anteponer nodos crece el contenido hacia arriba, así que sin corregir el
   * scroll la vista saltaría: hay que sumarle lo que creció el documento.
   */
  const loadOlder = useCallback(async () => {
    const el = scroller.current;
    const oldest = events[0];
    if (!el || !oldest || loadingRef.current || !hasMore) return;

    loadingRef.current = true;
    setLoadingOlder(true);
    const before = el.scrollHeight;
    const generation = historyGeneration.current;

    try {
      const res = await fetch(`/api/history?before=${oldest.id}&limit=${PAGE}`);
      const data: { events: ChatEvent[]; hasMore: boolean; sessionId: number } = await res.json();

      if (generation !== historyGeneration.current) return;
      if (data.events.length) {
        prepend(data.events, data.sessionId);
        // Esperar al repintado para medir la altura nueva.
        requestAnimationFrame(() => {
          if (generation !== historyGeneration.current) return;
          el.scrollTop += el.scrollHeight - before;
        });
      }
      setHasMore(data.hasMore);
    } catch {
      if (generation === historyGeneration.current) setHasMore(false);   // no reintentar en bucle si el endpoint falla
    } finally {
      if (generation === historyGeneration.current) {
        loadingRef.current = false;
        setLoadingOlder(false);
      }
    }
  }, [events, hasMore, prepend]);

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
  }, [visible, prefs.textSize]);

  const onScroll = useCallback(() => {
    const el = scroller.current;
    if (!el) return;

    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    pinnedRef.current = atBottom;
    setPinned(atBottom);
    if (atBottom) setUnread(0);

    if (el.scrollTop < NEAR_TOP) void loadOlder();
  }, [loadOlder]);

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
  const errors = stats?.status?.errors ?? [];
  const connected = PLATFORMS.filter((p) => stats?.status?.platforms?.[p]?.state === 'connected')
    .map((p) => PLATFORM_META[p].label);

  const connectionWarnings = PLATFORMS.flatMap((p) => {
    const state = stats?.status?.platforms?.[p]?.state;
    return state === 'error' || state === 'disconnected' || state === 'connecting'
      ? [`${PLATFORM_META[p].label}: ${state === 'error' ? 'error de conexión' : 'reconectando…'}`]
      : [];
  });

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-white/8 bg-[#0d0d10]">
      {/* ── encabezado: los logos son el título ── */}
      <header className="flex flex-wrap items-center gap-1 border-b border-white/8 px-2 py-2">
        {PLATFORMS.map((p) => {
          const off = hidden.has(p);
          const conn = stats?.status?.platforms?.[p];
          return (
            <button
              key={p}
              onClick={() => toggle(p)}
              title={[
                PLATFORM_META[p].label,
                conn?.detail ?? conn?.state,
                counts[p] ? `${counts[p]} mensajes` : null,
                off ? 'oculto — clic para mostrar' : 'clic para ocultar',
              ].filter(Boolean).join(' · ')}
              aria-label={`${PLATFORM_META[p].label}: ${off ? 'mostrar' : 'ocultar'} mensajes`}
              aria-pressed={!off}
              className={cn(
                'flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium transition',
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
            </button>
          );
        })}

        <div className="ml-auto flex items-center gap-2">
          <SettingsDialog stats={stats} />
        </div>
      </header>

      {(!live || connectionWarnings.length > 0) && (
        <div role="status" className="border-b border-amber-400/10 bg-amber-400/5 px-3 py-2 text-xs text-amber-200">
          {!live ? 'Reconectando al chat…' : connectionWarnings.join(' · ')}
        </div>
      )}

      {/* ── feed ── */}
      <div className="relative min-h-0 flex-1">
        <div
          ref={scroller}
          onScroll={onScroll}
          className="flex h-full flex-col overflow-y-auto overscroll-contain px-1.5 py-2"
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
            // `mt-auto` y NO `justify-end`: ambos pegan los mensajes abajo cuando
            // son pocos, pero `justify-end` en un contenedor con scroll empuja el
            // desbordamiento por encima del borde de inicio, donde el navegador no
            // puede llegar — el contenido viejo queda visible para el layout pero
            // imposible de alcanzar scrolleando.
            <ul className="mt-auto flex flex-col gap-0.5">
              {(loadingOlder || hasMore) && (
                <li className="py-2 text-center text-[11px] text-zinc-600">
                  {loadingOlder ? 'Cargando mensajes anteriores…' : ''}
                </li>
              )}
              {!hasMore && (
                <li className="py-2 text-center text-[11px] text-zinc-700">
                  Principio del directo
                </li>
              )}
              {visible.map((e, i) => (
                <ChatMessage
                  key={e.id}
                  event={e}
                  textSize={prefs.textSize}
                  mentionHandle={prefs.mentionHandle}
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
    </div>
  );
}
