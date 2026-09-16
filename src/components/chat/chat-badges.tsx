import { BadgeCheck, Crown, Gem, Shield, Star } from 'lucide-react';
import type { Badge as BadgeType } from '@/lib/types';
import { cn } from '@/lib/utils';

const STYLES: Record<BadgeType['kind'], { cls: string; Icon?: typeof Shield }> = {
  mod:      { cls: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/25', Icon: Shield },
  verified: { cls: 'bg-sky-500/15 text-sky-300 ring-sky-500/25', Icon: BadgeCheck },
  sub:      { cls: 'bg-fuchsia-500/15 text-fuchsia-300 ring-fuchsia-500/25', Icon: Star },
  level:    { cls: 'bg-amber-500/15 text-amber-300 ring-amber-500/25', Icon: Gem },
  fansclub: { cls: 'bg-violet-500/15 text-violet-300 ring-violet-500/25', Icon: Crown },
  badge:    { cls: 'bg-white/8 text-zinc-300 ring-white/10' },
};

export function ChatBadges({ badges }: { badges: BadgeType[] }) {
  if (!badges.length) return null;

  return (
    <>
      {badges.slice(0, 4).map((b, i) => {
        const s = STYLES[b.kind] ?? STYLES.badge;

        // Twitch y YouTube mandan la imagen real del badge; úsala cuando exista.
        if (b.imageUrl) {
          return (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i}
              src={b.imageUrl}
              alt={b.label}
              title={b.label}
              className="size-[15px] shrink-0 rounded-[3px]"
              loading="lazy"
            />
          );
        }

        const Icon = s.Icon;
        return (
          <span
            key={i}
            title={b.label}
            className={cn(
              'inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-px',
              'text-[10px] font-semibold leading-4 ring-1 ring-inset',
              s.cls,
            )}
          >
            {Icon && <Icon className="size-2.5" strokeWidth={2.5} />}
            {b.label}
          </span>
        );
      })}
    </>
  );
}
