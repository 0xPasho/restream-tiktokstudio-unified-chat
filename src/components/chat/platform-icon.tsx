import type { Platform } from '@/lib/types';
import { PLATFORM_META } from '@/lib/types';
import { cn } from '@/lib/utils';

const PATHS: Record<Platform, string> = {
  tiktok:
    'M16.6 5.82A4.28 4.28 0 0 1 15.54 3h-3.09v12.4a2.59 2.59 0 0 1-2.59 2.5 2.59 2.59 0 1 1 .77-5.06v-3.1a5.66 5.66 0 0 0-.77-.05A5.66 5.66 0 1 0 15.52 15V8.99a7.35 7.35 0 0 0 4.3 1.38V7.28a4.28 4.28 0 0 1-3.22-1.46Z',
  twitch:
    'M4.3 3 3 6.5v12h4v2.5h2.5l2.5-2.5h3.6L21 13V3H4.3Zm14.7 9.2-2.6 2.6h-3.9l-2.3 2.3v-2.3H7V4.7h12v7.5ZM16.4 7v4.3h-1.7V7h1.7Zm-4.6 0v4.3h-1.7V7h1.7Z',
  youtube:
    'M21.6 7.2a2.5 2.5 0 0 0-1.77-1.78C18.25 5 12 5 12 5s-6.25 0-7.83.42A2.5 2.5 0 0 0 2.4 7.2 26 26 0 0 0 2 12a26 26 0 0 0 .4 4.8 2.5 2.5 0 0 0 1.77 1.78C5.75 19 12 19 12 19s6.25 0 7.83-.42a2.5 2.5 0 0 0 1.77-1.78A26 26 0 0 0 22 12a26 26 0 0 0-.4-4.8ZM10 15.2V8.8l5.2 3.2-5.2 3.2Z',
  kick:
    'M3 3h5.6v4.2h2.1V5.1h2.1V3h5.6v6.3h-2.1v2.1h-2.1v2.1h2.1v2.1h2.1V21h-5.6v-2.1h-2.1v-2.1H8.6V21H3V3Z',
  restream:
    'M12 2 3 7v10l9 5 9-5V7l-9-5Zm0 2.3 6.9 3.8-6.9 3.8-6.9-3.8L12 4.3ZM5 9.9l6 3.3v6.6l-6-3.3V9.9Zm8 9.9v-6.6l6-3.3v6.6l-6 3.3Z',
};

export function PlatformIcon({
  platform,
  className,
  color,
  style,
}: {
  platform: Platform;
  className?: string;
  color?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={color ? PLATFORM_META[platform].color : 'currentColor'}
      className={cn('shrink-0', className)}
      style={style}
      aria-hidden="true"
    >
      <path d={PATHS[platform]} />
    </svg>
  );
}
