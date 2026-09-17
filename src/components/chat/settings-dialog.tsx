'use client';

import { useState } from 'react';
import { Check, Copy, Eye, EyeOff, Loader2, MessageSquare, Monitor, Plug, Plus, Settings } from 'lucide-react';
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
import { Tabs } from 'radix-ui';
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
    <div className="flex items-center justify-between gap-4 py-2">
      <div className="min-w-0 space-y-1">
        <Label htmlFor={id} className={disabled ? 'text-zinc-400' : undefined}>
          {label}
        </Label>
        <p id={`${id}-hint`} className="text-xs leading-relaxed text-zinc-400">{hint}</p>
      </div>
      <Switch id={id} aria-describedby={`${id}-hint`} className="shrink-0" checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </div>
  );
}

export function SettingsDialog({ stats }: { stats: Stats | null }) {
  const prefs = useViewPrefs();
  const [starting, setStarting] = useState(false);
  const [sessionNotice, setSessionNotice] = useState('');

  const startNewStream = async () => {
    setStarting(true);
    setSessionNotice('');
    try {
      const response = await fetch('/api/session', { method: 'POST' });
      if (!response.ok) throw new Error();
      setSessionNotice('Nuevo directo iniciado. El historial anterior sigue guardado.');
    } catch {
      setSessionNotice('No se pudo iniciar el directo. Inténtalo de nuevo.');
    } finally {
      setStarting(false);
    }
  };


  const [section, setSection] = useState('chat');
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [original, setOriginal] = useState<Settings | null>(null);
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState('');
  const [username, setUsername] = useState('');
  const [reveal, setReveal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [overlayTtl, setOverlayTtl] = useState('0');
  const [copyStatus, setCopyStatus] = useState('');
  const [error, setError] = useState<string | null>(null);

  const viewers = (stats?.viewers ?? []).reduce((a, r) => a + (r.viewers ?? 0), 0);

  // Cargar al abrir y no al montar, para que el modal nunca muestre algo
  // desactualizado. Va en el handler de apertura y no en un efecto: así el
  // fetch ocurre por una acción del usuario, no como reacción a un render.
  async function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) return;
    setError(null);
    setReveal(false);
    setLoading(true);
    setLoaded(false);
    try {
      const s: Settings = await fetch('/api/settings').then((r) => {
        if (!r.ok) throw new Error('No se pudieron cargar los ajustes');
        return r.json();
      });
      setOriginal(s);
      setLoaded(true);
      setToken(s.restreamToken);
      setUsername(s.tiktokUsername);
    } catch {
      setError('No se pudieron cargar las conexiones. Cierra los ajustes e inténtalo de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  const dirty = loaded && original !== null &&
    (extractToken(token) !== original.restreamToken || username !== original.tiktokUsername);

  async function save() {
    if (!dirty || saving) return;
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

      <DialogContent
        className="flex flex-col overflow-hidden"
        style={{ width: 'min(560px, calc(100% - 2rem))', maxWidth: 'none', height: 'min(780px, 90dvh)', padding: 0, gap: 0 }}
      >
        <DialogHeader className="shrink-0 px-5 pt-5 pb-4 pr-12">
          <DialogTitle className="text-xl font-semibold">Ajustes</DialogTitle>
          <DialogDescription>Tu chat, a tu manera.</DialogDescription>
        </DialogHeader>

        <Tabs.Root value={section} onValueChange={setSection} className="flex min-h-0 flex-1 flex-col">
          <Tabs.List aria-label="Secciones de ajustes" className="mx-5 mb-1 grid shrink-0 grid-cols-3 gap-1 rounded-lg bg-white/5 p-1">
            {[
              { value: 'chat', label: 'Chat', Icon: MessageSquare },
              { value: 'obs', label: 'OBS', Icon: Monitor },
              { value: 'connections', label: 'Conexiones', Icon: Plug },
            ].map(({ value, label, Icon }) => (
              <Tabs.Trigger key={value} value={value}
                className="flex min-w-0 items-center justify-center gap-1.5 rounded-md px-1 py-2 text-xs font-medium text-zinc-400 transition-colors hover:text-zinc-100 focus-visible:outline-2 focus-visible:outline-sky-300 data-[state=active]:bg-zinc-700/60 data-[state=active]:text-white sm:text-sm">
                <Icon className="hidden size-3.5 shrink-0 sm:block" aria-hidden />
                {label}
              </Tabs.Trigger>
            ))}
          </Tabs.List>

          <Tabs.Content value="chat" className="min-h-0 flex-1 space-y-4 overflow-x-hidden overflow-y-auto p-5 focus-visible:outline-2 focus-visible:outline-sky-300">
            <div className="space-y-3 rounded-lg border border-white/10 p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="font-medium">Conversación del directo</h3>
                <Button variant="outline" onClick={startNewStream} disabled={starting}>
                  <Plus className="size-3.5" aria-hidden />
                  {starting ? 'Iniciando…' : 'Nuevo directo'}
                </Button>
              </div>
              <p className="text-xs leading-relaxed text-zinc-400">Empieza con el chat y OBS vacíos. Conserva el historial y tus ajustes; reconectar no limpia la conversación.</p>
              {sessionNotice && <p role="status" className="text-xs leading-relaxed text-zinc-300">{sessionNotice}</p>}
            </div>
            <div className="space-y-1">
              <h3 className="font-medium">Lectura del chat</h3>
              <p className="text-xs leading-relaxed text-zinc-400">Los cambios se aplican al instante y se guardan en este navegador.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="text-size">Tamaño del texto</Label>
              <select id="text-size" value={prefs.textSize}
                onChange={(e) => setViewPrefs({ textSize: Number(e.target.value) })}
                className="h-10 w-full min-w-0 rounded-lg border border-white/15 bg-zinc-900 px-3 text-sm focus-visible:outline-2 focus-visible:outline-sky-300">
                <option value={14}>Compacto · 14 px</option>
                <option value={16}>Cómodo · 16 px</option>
                <option value={18}>Grande · 18 px</option>
              </select>
              <div className="rounded-lg bg-[#0d0d10] px-3 py-2.5" aria-label="Vista previa del tamaño de texto">
                <span className="text-xs font-semibold text-sky-300">Vista previa</span>
                <p className="mt-1 leading-normal text-zinc-100" style={{ fontSize: prefs.textSize }}>¡Hola! Qué bueno verte en vivo.</p>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="mention-handle">Resaltar menciones de</Label>
              <Input id="mention-handle" value={prefs.mentionHandle}
                onChange={(e) => setViewPrefs({ mentionHandle: e.target.value })}
                placeholder="Tu usuario, por ejemplo: pasho" autoComplete="off"
                aria-describedby="mention-hint" className="h-10 min-w-0" />
              <p id="mention-hint" className="text-xs text-zinc-400">Reconoce tu usuario con o sin @.</p>
            </div>
            <div>
              <h3 className="mb-1 font-medium">Qué quieres ver</h3>
              <div className="divide-y divide-white/5">
                <Toggle id="messages-only" label="Sólo mensajes" hint="Oculta regalos, follows, likes y otras actividades"
                  checked={prefs.messagesOnly} onChange={(v) => setViewPrefs({ messagesOnly: v })} />
                <Toggle id="show-likes" label="Likes"
                  hint={prefs.messagesOnly ? 'Ocultos por «Sólo mensajes»' : 'Mostrar los likes recibidos'}
                  checked={prefs.showLikes && !prefs.messagesOnly} disabled={prefs.messagesOnly}
                  onChange={(v) => setViewPrefs({ showLikes: v })} />
                <Toggle id="show-joins" label="Entradas al live"
                  hint={prefs.messagesOnly ? 'Ocultas por «Sólo mensajes»' : 'Avisar cuando alguien entra'}
                  checked={prefs.showJoins && !prefs.messagesOnly} disabled={prefs.messagesOnly}
                  onChange={(v) => setViewPrefs({ showJoins: v })} />
                <Toggle id="show-bots" label="Mensajes de bots" hint="Streamlabs, Nightbot y similares"
                  checked={prefs.showBots} onChange={(v) => setViewPrefs({ showBots: v })} />
              </div>
            </div>
          </Tabs.Content>

          <Tabs.Content value="obs" className="min-h-0 flex-1 space-y-6 overflow-x-hidden overflow-y-auto p-5 focus-visible:outline-2 focus-visible:outline-sky-300">
            <div className="space-y-1">
              <h3 className="font-medium">Chat sobre tu stream</h3>
              <p className="text-xs leading-relaxed text-zinc-400">Fondo transparente y hasta 6 mensajes, según el espacio disponible.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="overlay-ttl">Ocultar mensajes después de</Label>
              <select id="overlay-ttl" value={overlayTtl} onChange={(e) => { setOverlayTtl(e.target.value); setCopyStatus(''); }}
                className="h-10 w-full min-w-0 rounded-lg border border-white/15 bg-zinc-900 px-3 text-sm focus-visible:outline-2 focus-visible:outline-sky-300">
                <option value="0">Nunca</option>
                <option value="30">30 segundos</option>
                <option value="45">45 segundos</option>
              </select>
              <p className="text-xs leading-relaxed text-zinc-400">El tiempo cuenta desde que llega cada mensaje.</p>
            </div>
            <div className="space-y-4 rounded-xl border border-white/10 bg-white/[0.025] p-4">
              <h3 className="font-medium">Añádelo a OBS</h3>
              <ol className="list-decimal space-y-2 pl-4 text-sm leading-relaxed text-zinc-300">
                <li>Copia el enlace con esta configuración.</li>
                <li>En OBS, añade una fuente de navegador.</li>
                <li>Pega el enlace en el campo URL.</li>
              </ol>
              <Button className="w-full" onClick={async () => {
                const url = new URL('/', window.location.origin);
                url.searchParams.set('stream', '1');
                url.searchParams.set('ttl', overlayTtl);
                try {
                  await navigator.clipboard.writeText(url.href);
                  setCopyStatus('Enlace copiado');
                } catch {
                  setCopyStatus(`Copia este enlace: ${url.href}`);
                }
              }}>
                {copyStatus === 'Enlace copiado' ? <Check aria-hidden /> : <Copy aria-hidden />}
                Copiar enlace para OBS
              </Button>
              <p role="status" className="text-xs break-words text-zinc-300">{copyStatus}</p>
            </div>
            <p className="text-xs leading-relaxed text-zinc-400">Si ya tienes una fuente de chat, actualiza su URL para aplicar los cambios.</p>
          </Tabs.Content>

          <Tabs.Content value="connections" className="min-h-0 flex-1 space-y-6 overflow-x-hidden overflow-y-auto p-5 focus-visible:outline-2 focus-visible:outline-sky-300">
            <div className="space-y-1">
              <h3 className="font-medium">Conecta tus plataformas</h3>
              <p className="text-xs leading-relaxed text-zinc-400">Guardar reconecta el chat con los datos nuevos.</p>
            </div>
            {loading && <p role="status" className="text-sm text-zinc-400">Cargando conexiones…</p>}
            <div className="space-y-2">
              <Label htmlFor="token">Token de Restream</Label>
              <div className="flex min-w-0 gap-2">
                <Input id="token" type={reveal ? 'text' : 'password'} value={token}
                  disabled={!loaded || saving} onChange={(e) => setToken(e.target.value)}
                  placeholder="Pega el token o el enlace" autoComplete="off" spellCheck={false}
                  aria-describedby="token-hint" className="h-10 min-w-0 flex-1 font-mono" />
                <Button type="button" variant="outline" size="icon" className="size-10 shrink-0"
                  onClick={() => setReveal((v) => !v)} aria-label={reveal ? 'Ocultar token' : 'Mostrar token'}>
                  {reveal ? <EyeOff /> : <Eye />}
                </Button>
              </div>
              <p id="token-hint" className="text-xs leading-relaxed text-zinc-400">Acepta el token o el enlace completo de Restream.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="username">Usuario de TikTok</Label>
              <Input id="username" value={username} disabled={!loaded || saving}
                onChange={(e) => setUsername(e.target.value)} placeholder="pashoai"
                autoComplete="off" spellCheck={false} aria-describedby="username-hint" className="h-10 min-w-0" />
              <p id="username-hint" className="text-xs leading-relaxed text-zinc-400">Sin @. Debes estar en vivo para conectar.</p>
            </div>
            {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
            <div className="space-y-3">
              <h3 className="font-medium">Estado de las conexiones</h3>
              <ul className="divide-y divide-white/5 rounded-lg border border-white/10 px-3">
                {PLATFORMS.map((p) => {
                  const conn = stats?.status?.platforms?.[p];
                  const state = STATE_LABEL[conn?.state ?? 'connecting'];
                  return (
                    <li key={p} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-3 text-xs">
                      <PlatformIcon platform={p} className="size-4 shrink-0" style={{ color: PLATFORM_META[p].color }} />
                      <span className="text-zinc-200">{PLATFORM_META[p].label}</span>
                      <span className={cn('ml-auto font-medium', state.cls)}>{state.text}</span>
                      {conn?.detail && <span className="w-full break-words text-zinc-400">{conn.detail}</span>}
                    </li>
                  );
                })}
              </ul>
              <p className="text-xs text-zinc-400 tabular-nums">
                {viewers > 0 && <>{viewers.toLocaleString('es-MX')} espectadores · </>}
                {(stats?.total ?? 0).toLocaleString('es-MX')} eventos guardados
              </p>
              {(stats?.status?.errors?.length ?? 0) > 0 && (
                <ul className="space-y-1 text-xs break-words text-amber-300">
                  {stats!.status!.errors.slice(0, 3).map((message, i) => <li key={i}>{message}</li>)}
                </ul>
              )}
            </div>
          </Tabs.Content>
        </Tabs.Root>

        <DialogFooter className="shrink-0" style={{ margin: 0 }}>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>Cerrar</Button>
          {section === 'connections' && (
            <Button onClick={save} disabled={!dirty || saving || loading}>
              {saving && <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />}
              {saving ? 'Reconectando…' : 'Guardar conexiones'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
