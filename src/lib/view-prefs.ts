'use client';

import { useSyncExternalStore } from 'react';

export type ViewPrefs = {
  /** Sólo mensajes: oculta likes, regalos, follows, shares y entradas. */
  messagesOnly: boolean;
  /** Mostrar las entradas al live. */
  showJoins: boolean;
  /** Mostrar mensajes de bots como Streamlabs. */
  showBots: boolean;
  showLikes: boolean;
  textSize: number;
  mentionHandle: string;
};

const KEY = 'chat-view-prefs';

const DEFAULTS: ViewPrefs = {
  messagesOnly: false,
  showJoins: false,
  showBots: true,
  showLikes: false,
  textSize: 16,
  mentionHandle: '',
};

/**
 * Preferencias de vista en localStorage, no en SQLite: sólo afectan a este
 * navegador y deben aplicarse sin viaje al servidor. El token y el usuario sí
 * viven en la base porque cambian los sockets del colector.
 *
 * `useSyncExternalStore` evita el desajuste de hidratación que daría leer
 * localStorage durante el render: React usa el snapshot del servidor para
 * hidratar y luego adopta el del cliente.
 */
let cache: ViewPrefs = DEFAULTS;
const listeners = new Set<() => void>();

if (typeof window !== 'undefined') {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) cache = { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    // localStorage bloqueado o JSON corrupto: nos quedamos con los defaults
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function setViewPrefs(patch: Partial<ViewPrefs>) {
  cache = { ...cache, ...patch };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    // sin persistencia, pero la sesión actual sigue funcionando
  }
  for (const cb of listeners) cb();
}

export function useViewPrefs(): ViewPrefs {
  return useSyncExternalStore(
    subscribe,
    () => cache,
    () => DEFAULTS,
  );
}

/** Un evento pasa el filtro de vista. Compartido por el feed y el contador. */
export function passesView(
  e: { type: string; is_bot: boolean },
  prefs: ViewPrefs,
): boolean {
  if (prefs.messagesOnly && e.type !== 'chat') return false;
  if (!prefs.showLikes && e.type === 'like') return false;
  if (!prefs.showJoins && e.type === 'join') return false;
  if (!prefs.showBots && e.is_bot) return false;
  return true;
}
