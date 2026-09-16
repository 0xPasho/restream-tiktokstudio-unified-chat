export type Platform = 'tiktok' | 'twitch' | 'youtube' | 'kick' | 'restream';
export type EventType = 'chat' | 'gift' | 'like' | 'follow' | 'share' | 'join' | 'sub' | 'raid';

export type Badge = {
  kind: 'mod' | 'verified' | 'sub' | 'level' | 'fansclub' | 'badge';
  label: string;
  imageUrl?: string;
};

export type ChatEvent = {
  id: number;
  platform: Platform;
  type: EventType;
  ts: number;
  user_id: string | null;
  handle: string | null;
  nickname: string | null;
  avatar: string | null;
  color: string | null;
  text: string | null;
  is_bot: boolean;
  is_moderator: boolean;
  is_subscriber: boolean;
  is_first: boolean;
  badges: Badge[];
  meta: Record<string, unknown> | null;
};

export const PLATFORM_META: Record<Platform, { label: string; color: string; ring: string }> = {
  tiktok:   { label: 'TikTok',   color: '#FE2C55', ring: 'ring-[#FE2C55]/40' },
  twitch:   { label: 'Twitch',   color: '#9146FF', ring: 'ring-[#9146FF]/40' },
  youtube:  { label: 'YouTube',  color: '#FF0033', ring: 'ring-[#FF0033]/40' },
  kick:     { label: 'Kick',     color: '#53FC18', ring: 'ring-[#53FC18]/40' },
  restream: { label: 'Restream', color: '#4353FF', ring: 'ring-[#4353FF]/40' },
};
