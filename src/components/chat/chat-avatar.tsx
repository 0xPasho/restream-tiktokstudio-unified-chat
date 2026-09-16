'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { PlatformIcon } from './platform-icon';
import { PLATFORM_META, type Platform } from '@/lib/types';

/**
 * El avatar del usuario con el logo de la plataforma incrustado abajo a la derecha.
 * Es la pieza que unifica los tres estilos: en un feed mezclado tienes que saber
 * de dónde viene cada mensaje sin leer nada.
 */
export function ChatAvatar({
  platform,
  avatar,
  name,
  size = 36,
}: {
  platform: Platform;
  avatar: string | null;
  name: string;
  size?: number;
}) {
  const meta = PLATFORM_META[platform];
  const chip = Math.max(14, Math.round(size * 0.44));

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <Avatar className="size-full ring-1 ring-white/10">
        <AvatarImage src={avatar ?? undefined} alt="" loading="lazy" />
        <AvatarFallback
          className="text-[11px] font-semibold"
          style={{ backgroundColor: meta.color, color: meta.fg }}
        >
          {name.replace(/[^\p{L}\p{N}]/gu, '').slice(0, 2).toUpperCase() || '??'}
        </AvatarFallback>
      </Avatar>

      <span
        className="absolute -right-1 -bottom-1 grid place-items-center rounded-full ring-[1.5px] ring-[var(--chat-bg)]"
        style={{ width: chip, height: chip, backgroundColor: meta.color }}
        title={meta.label}
      >
        <PlatformIcon
          platform={platform}
          style={{ width: chip * meta.glyph, height: chip * meta.glyph, color: meta.fg }}
        />
      </span>
    </div>
  );
}
