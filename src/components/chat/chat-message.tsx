'use client';

import { memo } from 'react';
import { Gift, Heart, LogIn, Share2, UserPlus, Zap } from 'lucide-react';
import { ChatAvatar } from './chat-avatar';
import { ChatBadges } from './chat-badges';
import type { EventType } from '@/lib/types';
import type { FeedItem } from '@/lib/collapse';
import { userColor } from '@/lib/user-color';
import { cn } from '@/lib/utils';

/** Eventos que no son texto: se pintan como una tira compacta, no como mensaje. */
const SYSTEM: Partial<Record<EventType, { Icon: typeof Gift; cls: string }>> = {
  gift:   { Icon: Gift,     cls: 'text-pink-300 bg-pink-500/8' },
  like:   { Icon: Heart,    cls: 'text-zinc-400' },
  follow: { Icon: UserPlus, cls: 'text-zinc-400' },
  share:  { Icon: Share2,   cls: 'text-amber-300 bg-amber-500/8' },
  join:   { Icon: LogIn,    cls: 'text-zinc-400 bg-white/[0.03]' },
  sub:    { Icon: Zap,      cls: 'text-violet-300 bg-violet-500/8' },
  raid:   { Icon: Zap,      cls: 'text-orange-300 bg-orange-500/8' },
};

const time = (ts: number) =>
  new Date(ts).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false });

/** Enlaces clicables sin meter una librería de markdown. */
function withLinks(text: string) {
  return text.split(/(https?:\/\/\S+)/g).map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="text-sky-400 underline decoration-sky-400/30 underline-offset-2 hover:decoration-sky-400"
      >
        {part.replace(/^https?:\/\//, '')}
      </a>
    ) : (
      part
    ),
  );
}

export const ChatMessage = memo(function ChatMessage({
  event,
  showTime,
  textSize = 16,
  mentionHandle = '',
}: {
  event: FeedItem;
  showTime: boolean;
  textSize?: number;
  mentionHandle?: string;
}) {
  const name = event.nickname ?? event.handle ?? 'anónimo';
  const sys = SYSTEM[event.type];
  const handle = mentionHandle.trim().replace(/^@/, '').toLocaleLowerCase();
  const mentioned = !!handle && (event.text ?? '').toLocaleLowerCase()
    .split(/[^\p{L}\p{N}_.]+/u).includes(handle);
  const nameColor = event.color ?? userColor(event.user_id ?? event.handle ?? name);

  if (sys) {
    const { Icon, cls } = sys;
    return (
      <li className={cn('flex items-center gap-2 rounded-md px-3 py-1.5 text-[13px]', cls)}>
        <Icon className="size-3.5 shrink-0" strokeWidth={2.25} />
        <ChatAvatar platform={event.platform} avatar={event.avatar} name={name} size={20} />
        <span className="truncate font-medium text-zinc-200">{name}</span>
        <span className="truncate text-current" title={event.text ?? undefined}>{event.text}</span>
        {event.collapsed && event.collapsed > 1 && (
          <span className="shrink-0 rounded-full bg-white/8 px-1.5 text-[10px] font-semibold text-zinc-300 tabular-nums">
            ×{event.collapsed}
          </span>
        )}
        {showTime && <time className="ml-auto shrink-0 text-[11px] text-zinc-600">{time(event.ts)}</time>}
      </li>
    );
  }

  return (
    <li
      className={cn(
        'group relative flex gap-2.5 rounded-lg py-1.5 pr-2 pl-3 transition-colors hover:bg-white/[0.04]',
        mentioned && 'bg-sky-400/[0.08] ring-1 ring-inset ring-sky-400/25',
        !mentioned && event.is_first && 'bg-fuchsia-500/[0.07] ring-1 ring-inset ring-fuchsia-500/20',
        event.is_bot && 'opacity-55',
      )}
    >
      <ChatAvatar platform={event.platform} avatar={event.avatar} name={name} size={30} />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
          <span
            className="truncate text-[13px] font-semibold"
            style={{ color: nameColor }}
            title={event.handle ? `@${event.handle}` : name}
          >
            {name}
          </span>

          <ChatBadges badges={event.badges} />

          {mentioned && (
            <span className="rounded-full bg-sky-400/15 px-1.5 py-px text-[10px] font-semibold text-sky-200">te menciona</span>
          )}
          {event.is_first && (
            <span className="rounded-full bg-fuchsia-500/20 px-1.5 py-px text-[10px] font-semibold text-fuchsia-200">
              primer mensaje
            </span>
          )}

          <time className="ml-auto shrink-0 text-[11px] tabular-nums text-zinc-600 opacity-0 transition-opacity group-hover:opacity-100">
            {time(event.ts)}
          </time>
        </div>

        <p className="mt-0.5 leading-normal break-words text-zinc-100" style={{ fontSize: textSize }}>
          {withLinks(event.text ?? '')}
        </p>
      </div>
    </li>
  );
});
