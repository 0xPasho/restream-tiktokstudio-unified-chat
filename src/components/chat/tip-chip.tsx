'use client';

import { Gem } from 'lucide-react';
import { tipAmountLabel, tipLevel, tipNote, type Tip } from '@/lib/tip';
import { cn } from '@/lib/utils';

/**
 * El oro es del dinero y de nada más.
 *
 * En el feed el ámbar ya estaba ocupado por "compartió", que se movió a verde
 * azulado justo por esto: si el mismo tono marca un share y un super chat de mil
 * pesos, deja de significar algo. Lo único que sigue en ámbar fuera de aquí es
 * la barra de aviso de conexión, que no vive dentro de la lista de mensajes.
 *
 * Un solo tono en cuatro intensidades, no cuatro colores: quien mira el chat de
 * reojo mientras transmite no tiene que aprender una escala, ve que una fila
 * pesa más que la otra.
 */
const CHIP = [
  'bg-amber-500/15 text-amber-200 ring-amber-400/25',
  'bg-amber-500/25 text-amber-100 ring-amber-400/40',
  'bg-amber-400/30 text-amber-50 ring-amber-300/50',
  'bg-amber-300 text-zinc-950 ring-amber-200/70',
];

/** Fondo y aro de la fila. El nivel 0 —una rosa, un bit— no toca la fila. */
export const TIP_ROW = [
  '',
  'bg-amber-500/[0.07] ring-1 ring-inset ring-amber-400/20',
  'bg-amber-500/[0.11] ring-1 ring-inset ring-amber-400/35',
  'bg-amber-400/[0.15] ring-1 ring-inset ring-amber-300/55',
];

export function TipChip({
  tip,
  variant = 'feed',
  className,
}: {
  tip: Tip;
  /** El overlay va encima de vídeo cualquiera: ahí la píldora es opaca siempre. */
  variant?: 'feed' | 'overlay';
  className?: string;
}) {
  const level = tipLevel(tip);
  const note = tipNote(tip);
  const label = tipAmountLabel(tip);
  const overlay = variant === 'overlay';

  return (
    <span
      title={[label, note].filter(Boolean).join(' · ')}
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full font-semibold tabular-nums ring-1 ring-inset',
        overlay
          // Un ámbar translúcido sobre gameplay claro no se lee. Opaco y con
          // texto casi negro se lee sobre lo que sea.
          ? 'bg-amber-300 px-[0.45em] py-[0.05em] text-[0.72em] text-zinc-950 ring-amber-100/60'
          : cn('px-1.5 py-px text-[11px] leading-4', CHIP[level]),
        className,
      )}
    >
      {tip.kind === 'diamonds' && (
        <Gem className={overlay ? 'size-[0.85em]' : 'size-2.5'} strokeWidth={2.5} />
      )}
      {label}
      {note && <span className="font-medium opacity-70">{note}</span>}
    </span>
  );
}
