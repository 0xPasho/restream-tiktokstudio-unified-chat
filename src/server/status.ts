import type { Platform } from '@/lib/types';

export type ConnState = 'connecting' | 'connected' | 'disconnected' | 'error' | 'offline';

export type Status = {
  startedAt: number;
  platforms: Partial<Record<Platform, { state: ConnState; detail?: string; since: number }>>;
  /** Último frame recibido de cada fuente, para detectar sockets vivos pero mudos. */
  lastFrameAt: { restream?: number; tiktok?: number };
  errors: string[];
};

/**
 * Estado vivo de los colectores. Global para sobrevivir el hot-reload de dev,
 * igual que el guard de instrumentation.
 */
const g = globalThis as typeof globalThis & { __chatStatus?: Status };

export const status: Status =
  g.__chatStatus ??
  (g.__chatStatus = { startedAt: Date.now(), platforms: {}, lastFrameAt: {}, errors: [] });

export function setState(platform: Platform, state: ConnState, detail?: string) {
  status.platforms[platform] = { state, detail, since: Date.now() };
}

export function markFrame(source: 'restream' | 'tiktok') {
  status.lastFrameAt[source] = Date.now();
}

export function pushError(message: string) {
  status.errors.unshift(`${new Date().toLocaleTimeString('es-MX', { hour12: false })} ${message}`);
  status.errors.length = Math.min(status.errors.length, 8);
}
