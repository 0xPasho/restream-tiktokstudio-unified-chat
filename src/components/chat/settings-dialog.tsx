'use client';

import { useState } from 'react';
import { Eye, EyeOff, Loader2, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { setViewPrefs, useViewPrefs } from '@/lib/view-prefs';
import { cn } from '@/lib/utils';
import { PlatformIcon } from './platform-icon';
import { PLATFORM_META, type Platform } from '@/lib/types';
import type { ConnState, Stats } from '@/lib/use-chat-stream';

type Settings = { restreamToken: string; tiktokUsername: string };

const PLATFORMS: Platform[] = ['tiktok', 'twitch', 'youtube', 'kick'];

/**
 * El estado se dice con palabras y color de texto, no con un punto parpadeante:
 * algo que late en el borde de la vista compite con el chat, que es lo que
 * realmente hay que mirar mientras transmites.
 */
const STATE_LABEL: Record<ConnState, { text: string; cls: string }> = {
  connected:    { text: 'Conectado',     cls: 'text-emerald-400' },
  connecting:   { text: 'Conectando…',   cls: 'text-amber-400' },
  disconnected: { text: 'Reconectando…', cls: 'text-amber-400' },
  error:        { text: 'Error',         cls: 'text-red-400' },
  offline:      { text: 'Apagado',       cls: 'text-zinc-500' },
};

/** Acepta la URL completa del embed o sólo el token; de la URL extrae el token. */
function extractToken(raw: string): string {
  const trimmed = raw.trim();
  const match = trimmed.match(/[?&]token=([^&\s]+)/);
  return match ? match[1] : trimmed;
}

/** Una fila de interruptor con su etiqueta y una nota corta. */
function Toggle({
  id,
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-0.5">
        <Label htmlFor={id} className={disabled ? 'text-zinc-500' : undefined}>
          {label}
        </Label>
        <p className="text-[11px] text-zinc-500">{hint}</p>
      </div>
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </div>
  );
}

export function SettingsDialog({ stats }: { stats: Stats | null }) {
  const prefs = useViewPrefs();
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState('');
  const [username, setUsername] = useState('');
  const [reveal, setReveal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const viewers = (stats?.viewers ?? []).reduce((a, r) => a + (r.viewers ?? 0), 0);

  // Cargar al abrir y no al montar, para que el modal nunca muestre algo
  // desactualizado. Va en el handler de apertura y no en un efecto: así el
  // fetch ocurre por una acción del usuario, no como reacción a un render.
  async function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) return;
    setError(null);
    try {
      const s: Settings = await fetch('/api/settings').then((r) => r.json());
      setToken(s.restreamToken);
      setUsername(s.tiktokUsername);
    } catch {
      setError('No se pudieron cargar los ajustes');
    }
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restreamToken: extractToken(token),
          tiktokUsername: username,
        }),
      });
      if (!res.ok) throw new Error((await res.json())?.error ?? 'Error al guardar');
      setOpen(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <button
          className="rounded-md p-1 text-zinc-500 transition hover:bg-white/5 hover:text-zinc-200 focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:outline-none"
          aria-label="Ajustes"
          title="Ajustes"
        >
          <Settings className="size-4" />
        </button>
      </DialogTrigger>

      {/* Sólo el cuerpo hace scroll: con tres secciones el modal ya es más alto
          que pantallas chicas, y los botones no deben irse con el contenido. */}
      <DialogContent className="flex max-h-[85dvh] flex-col sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ajustes</DialogTitle>
          <DialogDescription>
            Al guardar, los colectores se reconectan con los valores nuevos.
          </DialogDescription>
        </DialogHeader>

        <div className="-mx-1 min-h-0 flex-1 space-y-4 overflow-y-auto px-1 py-1">
          <p className="text-[11px] font-semibold tracking-wide text-zinc-400 uppercase">Fuentes</p>
          <div className="space-y-1.5">
            <Label htmlFor="token">Token de Restream</Label>
            <div className="flex gap-1.5">
              <Input
                id="token"
                type={reveal ? 'text' : 'password'}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="d983e379-c425-…"
                autoComplete="off"
                spellCheck={false}
                className="font-mono text-xs"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setReveal((v) => !v)}
                aria-label={reveal ? 'Ocultar token' : 'Mostrar token'}
              >
                {reveal ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </Button>
            </div>
            <p className="text-[11px] text-zinc-500">
              Puedes pegar la URL completa del embed; se extrae el token solo.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="username">Usuario de TikTok</Label>
            <Input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="pashoai"
              autoComplete="off"
              spellCheck={false}
              className="font-mono text-xs"
            />
            <p className="text-[11px] text-zinc-500">Sin la arroba. Debe estar en vivo para conectar.</p>
          </div>

          {error && <p className="text-[12px] text-red-400">{error}</p>}

          <Separator />

          <div className="space-y-3">
            <p className="text-[11px] font-semibold tracking-wide text-zinc-400 uppercase">Vista</p>

            <Toggle
              id="messages-only"
              label="Sólo mensajes"
              hint="Oculta likes, regalos, follows, shares y entradas"
              checked={prefs.messagesOnly}
              onChange={(v) => setViewPrefs({ messagesOnly: v })}
            />

            <Toggle
              id="show-joins"
              label="Entradas al live"
              hint={prefs.messagesOnly ? 'Ya ocultas por «Sólo mensajes»' : 'Avisar cuando alguien entra'}
              checked={prefs.showJoins && !prefs.messagesOnly}
              disabled={prefs.messagesOnly}
              onChange={(v) => setViewPrefs({ showJoins: v })}
            />

            <Toggle
              id="show-bots"
              label="Mensajes de bots"
              hint="Streamlabs, Nightbot y similares"
              checked={prefs.showBots}
              onChange={(v) => setViewPrefs({ showBots: v })}
            />

            <p className="text-[11px] text-zinc-600">
              La vista se guarda en este navegador y se aplica al instante.
            </p>
          </div>

          <Separator />

          <div className="space-y-2">
            <p className="text-[11px] font-semibold tracking-wide text-zinc-400 uppercase">Estado</p>

            <ul className="space-y-1.5">
              {PLATFORMS.map((p) => {
                const conn = stats?.status?.platforms?.[p];
                const state = STATE_LABEL[conn?.state ?? 'connecting'];
                return (
                  <li key={p} className="flex items-center gap-2 text-[12px]">
                    <PlatformIcon
                      platform={p}
                      className="size-3.5 shrink-0"
                      style={{ color: PLATFORM_META[p].color }}
                    />
                    <span className="w-14 shrink-0 text-zinc-300">{PLATFORM_META[p].label}</span>
                    <span className="min-w-0 flex-1 truncate text-zinc-500">{conn?.detail ?? ''}</span>
                    <span className={cn('shrink-0 font-medium', state.cls)}>{state.text}</span>
                  </li>
                );
              })}
            </ul>

            <p className="pt-1 text-[11px] text-zinc-500 tabular-nums">
              {viewers > 0 && <>{viewers.toLocaleString('es-MX')} espectadores · </>}
              {(stats?.total ?? 0).toLocaleString('es-MX')} eventos guardados
            </p>

            {(stats?.status?.errors?.length ?? 0) > 0 && (
              <ul className="space-y-0.5 pt-1 text-[11px] text-amber-400/80">
                {stats!.status!.errors.slice(0, 3).map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <DialogFooter>
          {/* «Cerrar» y no «Cancelar»: los interruptores de vista ya se
              aplicaron, así que no hay nada que deshacer. Los campos de fuentes
              se recargan al abrir, de modo que cerrar sin guardar los descarta. */}
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
            Cerrar
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            {saving ? 'Reconectando…' : 'Guardar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
